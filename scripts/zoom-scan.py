#!/usr/bin/env python3
"""Relève la taille de police effective de chaque champ de saisie de l'app.

POURQUOI CE SCRIPT EXISTE
Safari iOS zoome sur un champ dont la police calculée est < 16px, et ne dézoome jamais — la page
reste agrandie, y compris après un retour arrière. C'est le bug le plus visible de la bêta.

CE QU'IL RÉSOUT, ET QUI SE VOIT MAL À L'ŒIL
1. Les styles composés : `style={[styles.input, styles.small]}` prend le fontSize du DERNIER
   objet qui en définit un. Un champ peut donc repasser sous 16 sans que sa propre définition mente.
2. Les composants d'aide : `<DecimalTextInput style={styles.input} />` n'est pas une balise
   `<TextInput>`, mais il en rend une. Ne chercher que `<TextInput` les manque tous — et ce sont
   précisément les champs de paramètres de la main (blindes, ante, straddle, tapis).

Lancer depuis la racine du dépôt :  python3 scripts/zoom-scan.py
"""
import re, pathlib

ROOT = pathlib.Path('pokza-app/src')
SEUIL = 16

def style_sizes(src):
    """fontSize de chaque objet de style de premier niveau du fichier."""
    sizes = {}
    for m in re.finditer(r'^  (\w+)\s*:\s*\{', src, re.M):
        i, depth = m.end() - 1, 0
        while i < len(src):
            if src[i] == '{': depth += 1
            elif src[i] == '}':
                depth -= 1
                if depth == 0: break
            i += 1
        fs = re.search(r'\bfontSize\s*:\s*([0-9]+)', src[m.end():i])
        if fs: sizes[m.group(1)] = int(fs.group(1))
    return sizes

rows = []
for path in sorted(ROOT.rglob('*.tsx')):
    src = path.read_text(encoding='utf-8')
    sizes = style_sizes(src)
    # toute balise dont le nom FINIT par « Input » : TextInput, DecimalTextInput, LevelNumberInput…
    # (finit par, et non contient : sinon on ramasse des types comme TextInputKeyPressEventData)
    for m in re.finditer(r'<([A-Z]\w*Input)\b', src):
        # `useRef<TextInput>(null)` n'est pas un champ, c'est une annotation de type
        if src[max(0, m.start() - 6):m.start()] == 'useRef': continue
        j, depth = m.end(), 0
        while j < len(src):
            if src[j] == '{': depth += 1
            elif src[j] == '}': depth -= 1
            elif src[j] == '>' and depth == 0: break
            j += 1
        tag, line = src[m.start():j], src[:m.start()].count('\n') + 1
        refs = re.findall(r'styles\.(\w+)', tag)
        inline = re.search(r'fontSize\s*:\s*([0-9]+)', tag)
        eff, origin = None, ''
        for r in refs:
            if r in sizes: eff, origin = sizes[r], f'styles.{r}'
        if inline: eff, origin = int(inline.group(1)), 'inline'
        # Deux cas qui ne sont pas des trous, mais des renvois :
        #  · `style={style}`  → le composant relaie le style de son appelant (résolu chez lui)
        #  · aucun `style=`   → le composant se style tout seul ; son propre TextInput est scanné
        passthrough = not refs and not inline and (
            re.search(r'style=\{style\}', tag) or 'style=' not in tag)
        rows.append((str(path), line, m.group(1), ' + '.join(refs), eff, origin, passthrough))

bad = [r for r in rows if not r[6] and (r[4] is None or r[4] < SEUIL)]
relay = [r for r in rows if r[6]]
ok = [r for r in rows if not r[6] and r[4] is not None and r[4] >= SEUIL]

print(f'{len(rows)} champs — {len(bad)} SOUS {SEUIL}px, {len(ok)} conformes, '
      f'{len(relay)} relais (style reçu du parent)\n')
if bad:
    print(f'*** CHAMPS QUI DÉCLENCHENT LE ZOOM iOS ***')
    print('-' * 96)
    for p, l, tag, refs, eff, origin, _ in bad:
        print(f'{(str(eff)+"px") if eff is not None else "  ?":>5}  <{tag}>  {p}:{l}')
        print(f'         styles : {refs or "(aucun)"}   retenu : {origin or "aucun fontSize"}')
    print()
else:
    print(f'✅ aucun champ sous {SEUIL}px\n')

print('RELAIS — leur police vient de l\'appelant, vérifié ci-dessous')
print('-' * 96)
for p, l, tag, *_ in relay:
    print(f'       <{tag}>  {p}:{l}')
print()
print(f'CONFORMES (≥ {SEUIL}px)')
print('-' * 96)
for p, l, tag, refs, eff, origin, _ in ok:
    print(f'{eff:>3}px  <{tag}>  {p}:{l}   [{origin}]')

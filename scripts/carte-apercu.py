#!/usr/bin/env python3
"""Fabrique les vignettes des liens Pokza — les images que WhatsApp, Discord ou Slack affichent
quand quelqu'un colle un lien vers une main, un groupe ou un profil.

    python3 scripts/carte-apercu.py

Écrit `pokza-app/public/apercu-<langue>.png` (1200x630) pour chaque langue du catalogue, plus
`apercu.png`, copie de la française — cette URL-là est déjà partie dans des conversations le
23/09/2026 et les aperçus déjà envoyés continuent de la demander. Les fichiers sont recopiés dans
`dist/` par `expo export`, et `worker.js` désigne le bon selon la langue de l'expéditeur.

Met aussi à jour la description de `public/manifest.json` — celle que voit qui installe la PWA —
depuis la même clé française. Il n'y a donc plus qu'une seule source pour cette phrase.

POURQUOI UN SCRIPT ET PAS DES IMAGES POSÉES À LA MAIN : le dessin vient de la MÊME source que
l'icône de l'app (`assets/pokza-icon-source.svg`, tracé et transformation recopiés ci-dessous) et
la phrase de la MÊME source que les aperçus et l'app (la clé `apercu.phrase` des catalogues,
vérifiée par `scripts/i18n-audit.js`). Le jour où l'une des deux bouge, on relance et tout suit.

1200x630 est le format qui donne la GRANDE carte dans WhatsApp (ratio 1.91:1). En dessous de
300x200 la plupart des messageries retombent sur une vignette minuscule à côté du texte.
"""
import json
import pathlib
import unicodedata
from PIL import Image, ImageDraw, ImageFont, features

RACINE = pathlib.Path(__file__).resolve().parent.parent
CATALOGUES = RACINE / 'pokza-app' / 'src' / 'i18n' / 'catalogues'
PUBLIC = RACINE / 'pokza-app' / 'public'

L, H = 1200, 630
MARGE = 60              # ce qui reste au texte : 1080 px de large
NAVY = '#16233D'        # colors.tableFelt
ORANGE = '#E8571F'      # colors.action
PARCHEMIN = '#EDEAE2'   # colors.feedBackground
PARCHEMIN_ESTOMPE = (237, 234, 226, 165)

# Tracé du logo, recopié tel quel d'assets/pokza-icon-source.svg (viewBox 1000x1000).
CONTOUR = [(317, 240), (433, 240), (683, 405), (433, 570), (433, 760), (317, 760)]
TROU = [(433, 342), (563, 405), (433, 468)]
# Le même `transform` que le SVG : translate(36 17) translate(500 500) scale(1.08) translate(-500 -500)
transforme = lambda p, t: (
    (1.08 * (p[0] - 500) + 500 + 36) * t / 1000,
    (1.08 * (p[1] - 500) + 500 + 17) * t / 1000,
)


def police(taille, graisse=400):
    """SF Pro, la police système — c'est `fonts.sans: 'System'` du thème, donc ce que l'app affiche.
    Helvetica en secours sur une machine où SF n'est pas là.

    ⚠️ SFNS.ttf est une police VARIABLE à quatre axes, dans cet ordre : largeur, taille optique,
    graisse de rendu, graisse. `set_variation_by_axes([700])` ne met donc pas le gras : il pousse la
    LARGEUR à 700 pour un axe qui plafonne à 150, et le mot sort étiré. Les quatre valeurs sont
    passées, toujours. La taille optique est calée sur la taille du texte, ce pour quoi elle existe."""
    for chemin in ('/System/Library/Fonts/SFNS.ttf', '/System/Library/Fonts/HelveticaNeue.ttc'):
        try:
            f = ImageFont.truetype(chemin, taille)
            try:
                f.set_variation_by_axes([100, min(96, max(17, taille)), 400, graisse])
            except Exception:
                pass  # Helvetica n'est pas variable : elle sort en Regular, ce qui reste lisible.
            return f
        except OSError:
            continue
    raise SystemExit('Aucune police trouvée — ni SF Pro ni Helvetica.')


# ⚠️ SF PRO NE COUVRE NI LE HAN, NI LE HANGUL, NI LES KANA, NI LE THAÏ — et le défaut est MUET :
# PIL ne lève rien, il dessine le glyphe .notdef, c'est-à-dire un carré. La vignette chinoise est
# sortie avec une rangée de carrés à la place de la phrase, le 26/09/2026, et seul son POIDS le
# disait (13 Ko contre 23 pour les langues latines).
#
# ⚠️ CE N'EST PAS LE MÊME PROBLÈME QUE DANS L'APP, et c'est pour ça qu'il a été manqué : l'app
# écrit en fonte SYSTÈME, qui couvre toutes les écritures. Ce script, lui, charge un CHEMIN DE
# FONTE EN DUR. Deux surfaces, deux réponses — vérifier l'une ne dit rien de l'autre.
#
# Les fontes de secours sont ESSAYÉES, pas déclarées : on compare le glyphe rendu à celui de
# U+E000 (zone privée, jamais dessinée, donc toujours .notdef). Si les deux bitmaps sont
# identiques, la fonte n'a pas le caractère et on passe à la suivante. Une écriture de plus, ou
# un macOS qui déplace ses fontes, se règle donc tout seul — rien à tenir à jour ici.
# ⚠️ PIL NE COMPOSE PAS LES ÉCRITURES COMPLEXES SANS libraqm, et là encore le défaut est MUET.
# Le thaï écrit ses voyelles et ses tons en MARQUES COMBINANTES posées au-dessus et au-dessous de
# la consonne. Sans composition, PIL dessine chaque marque ISOLÉMENT — et une marque isolée se
# rend avec son cercle pointillé de substitution. La vignette thaïe est sortie couverte de petits
# ronds, le 26/09/2026 ; la fonte n'y était pour rien, elle avait tous les caractères.
#
# Ça ne se voit pas au poids du fichier (29 Ko, comme une vignette normale) : il faut REGARDER.
#
# Concerne aujourd'hui le thaï seul, mais concernera l'arabe, l'hébreu, le persan et l'hindi le
# jour où ils arriveront. La vignette retombe donc sur la phrase ANGLAISE, en le DISANT à chaque
# passage : une carte lisible en anglais vaut mieux qu'une carte illisible dans la bonne langue.
#
# Pour l'avoir dans la bonne langue : `brew install libraqm` puis réinstaller Pillow
# (`pip install --force-reinstall --no-binary :all: Pillow`), et relancer ce script.
COMPOSITION = features.check('raqm')


def besoin_de_composition(texte):
    """Le texte porte-t-il des marques qui doivent se poser SUR une autre lettre ?"""
    return any(unicodedata.category(c) in ('Mn', 'Mc', 'Me') for c in texte)


SECOURS = (
    '/System/Library/Fonts/Hiragino Sans GB.ttc',        # han + kana (chinois, japonais)
    '/System/Library/Fonts/AppleSDGothicNeo.ttc',        # hangul (coréen)
    '/System/Library/Fonts/ThonburiUI.ttc',              # thaï
    '/System/Library/Fonts/Supplemental/Thonburi.ttc',
    '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',  # le filet : presque tout Unicode
)


def _manque(font, caractere):
    """La fonte dessine-t-elle ce caractère, ou son carré ?

    On compare la BOÎTE du glyphe à celle de U+FFFF, un « non-caractère » qu'Unicode garantit ne
    jamais assigner : aucune fonte ne l'a, donc elle dessine forcément son .notdef. Même boîte =
    même carré = caractère absent.

    ⚠️ PREMIER JET FAUX, ET IL A ÉCHOUÉ BRUYAMMENT : il comparait `getmask(c).tobytes()`, une
    méthode qui n'existe pas sur cette version de PIL. Chaque appel tombait donc dans son `except`
    et déclarait TOUT manquant — y compris le cyrillique, que SF Pro écrit très bien. Le script
    s'est arrêté sur « Мрежат » au lieu de fabriquer des vignettes fausses, ce qui est exactement
    le comportement voulu d'un contrôle qui se trompe.

    ⚠️ ET U+E000 NE CONVIENT PAS non plus, alors que c'est de la zone privée : Apple y range ses
    SF Symbols, donc SF Pro a bel et bien un glyphe à cette position.

    La limite assumée : deux glyphes peuvent partager une boîte par hasard. L'erreur ne va alors
    que dans le sens sûr — on passe à la fonte suivante, et si aucune ne convient on s'arrête.
    """
    try:
        return font.getbbox(caractere) == font.getbbox('\uffff')
    except Exception:
        return True


def police_pour(texte, taille, graisse=400):
    """La police du thème si elle sait écrire `texte`, sinon la première de SECOURS qui sait."""
    principale = police(taille, graisse)
    inconnus = [c for c in texte if ord(c) > 0x2FF and _manque(principale, c)]
    if not inconnus:
        return principale
    for chemin in SECOURS:
        try:
            f = ImageFont.truetype(chemin, taille)
        except OSError:
            continue
        if not any(_manque(f, c) for c in inconnus):
            return f
    # Aucune ne convient : mieux vaut s'arrêter que publier une vignette de carrés.
    raise SystemExit(
        f"Aucune police ne sait écrire « {''.join(dict.fromkeys(inconnus))[:12]} » — "
        f'ajouter une fonte à SECOURS dans {__file__}.'
    )


def largeur(d, texte, font):
    x0, _, x1, _ = d.textbbox((0, 0), texte, font=font)
    return x1 - x0


def centre(d, texte, y, font, couleur):
    x0, _, x1, _ = d.textbbox((0, 0), texte, font=font)
    d.text(((L - (x1 - x0)) / 2 - x0, y), texte, font=font, fill=couleur)


def deux_lignes(phrase):
    """Coupe sur les deux-points, qui séparent justement ce qu'est Pokza de ce qu'on y fait.
    La coupe garde le signe ET son espacement d'origine : le français écrit « poker : partage »,
    l'anglais « network: share ». Recomposer à la main mettrait l'espace française partout."""
    i = phrase.find(':')
    if i < 0:
        return phrase, ''
    return phrase[: i + 1].rstrip(), phrase[i + 1:].strip()


def carte(phrase):
    # Dessiné 3x puis réduit : ni le squircle ni les diagonales du logo n'ont d'anticrénelage sinon.
    E = 3
    img = Image.new('RGB', (L * E, H * E), NAVY)
    d = ImageDraw.Draw(img)

    cote = 156 * E
    x, y = (L * E - cote) // 2, 96 * E
    d.rounded_rectangle([x, y, x + cote, y + cote], radius=int(cote * 0.225), fill=ORANGE)
    d.polygon([(x + a, y + b) for a, b in (transforme(p, cote) for p in CONTOUR)], fill=PARCHEMIN)
    d.polygon([(x + a, y + b) for a, b in (transforme(p, cote) for p in TROU)], fill=ORANGE)

    img = img.resize((L, H), Image.LANCZOS)
    d = ImageDraw.Draw(img, 'RGBA')

    centre(d, 'Pokza', 292, police(96, graisse=700), PARCHEMIN)

    # L'allemand est un tiers plus long que le français pour la même phrase : la taille descend
    # jusqu'à ce que la ligne la plus large tienne, au lieu de déborder hors de la carte.
    haut, bas = deux_lignes(phrase)
    taille = 31
    while taille > 20:
        f = police_pour(phrase, taille)
        if max(largeur(d, haut, f), largeur(d, bas, f)) <= L - 2 * MARGE:
            break
        taille -= 1
    f = police_pour(phrase, taille)
    centre(d, haut, 430, f, PARCHEMIN_ESTOMPE)
    centre(d, bas, 430 + taille + 17, f, PARCHEMIN_ESTOMPE)
    return img


def main():
    langues = sorted(
        f.stem for f in CATALOGUES.glob('*.json') if not f.name.endswith('.source.json')
    )
    phrases = {
        l: json.loads((CATALOGUES / f'{l}.json').read_text())['apercu.phrase'] for l in langues
    }

    # Les langues dont l'écriture demande une composition que PIL ne sait pas faire ici : on prend
    # la phrase anglaise pour LEUR vignette, et on le dit. Voir le bandeau de COMPOSITION.
    degradees = [
        l for l in langues
        if not COMPOSITION and l != 'en' and besoin_de_composition(phrases[l])
    ]
    if degradees:
        print(f"⚠️ libraqm absent : {', '.join(degradees)} — vignette rendue avec la phrase ANGLAISE,")
        print('   parce que sans composition leurs marques sortiraient en cercles pointillés.')
        print('   Pour les avoir dans leur langue : brew install libraqm, puis réinstaller Pillow.')

    for langue in langues:
        img = carte(phrases['en'] if langue in degradees else phrases[langue])
        cible = PUBLIC / f'apercu-{langue}.png'
        img.save(cible, optimize=True)
        print(f'{cible.relative_to(RACINE)} — {cible.stat().st_size // 1024} Ko')
        if langue == 'fr':
            # L'URL d'avant le multilingue. Des aperçus déjà envoyés la demandent encore.
            img.save(PUBLIC / 'apercu.png', optimize=True)

    manifeste = PUBLIC / 'manifest.json'
    m = json.loads(manifeste.read_text())
    if m['description'] != phrases['fr']:
        m['description'] = phrases['fr']
        manifeste.write_text(json.dumps(m, ensure_ascii=False, indent=2) + '\n')
        print(f'{manifeste.relative_to(RACINE)} — description réalignée sur apercu.phrase')


if __name__ == '__main__':
    main()

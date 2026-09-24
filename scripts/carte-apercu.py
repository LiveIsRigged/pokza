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
from PIL import Image, ImageDraw, ImageFont

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
        f = police(taille)
        if max(largeur(d, haut, f), largeur(d, bas, f)) <= L - 2 * MARGE:
            break
        taille -= 1
    f = police(taille)
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

    for langue in langues:
        img = carte(phrases[langue])
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

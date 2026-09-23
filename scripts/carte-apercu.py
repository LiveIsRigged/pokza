#!/usr/bin/env python3
"""Fabrique la vignette des liens Pokza — l'image que WhatsApp, Discord ou Slack affichent
quand quelqu'un colle un lien vers une main, un groupe ou un profil.

    python3 scripts/carte-apercu.py

Écrit `pokza-app/public/apercu.png` (1200x630), que `expo export` recopie dans `dist/` et que
le Worker désigne en `og:image`. À relancer seulement si le logo ou la phrase changent.

POURQUOI UN SCRIPT ET PAS UNE IMAGE POSÉE À LA MAIN : le dessin vient de la MÊME source que
l'icône de l'app (`assets/pokza-icon-source.svg`, tracé et transformation recopiés ci-dessous)
et la phrase de la MÊME source que la fiche d'installation (`public/manifest.json`). Le jour où
l'une des deux bouge, on relance et tout reste d'accord.

1200x630 est le format qui donne la GRANDE carte dans WhatsApp (ratio 1.91:1). En dessous de
300x200 la plupart des messageries retombent sur une vignette minuscule à côté du texte.
"""
import json
import pathlib
from PIL import Image, ImageDraw, ImageFont

RACINE = pathlib.Path(__file__).resolve().parent.parent
SORTIE = RACINE / 'pokza-app' / 'public' / 'apercu.png'

L, H = 1200, 630
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


def centre(d, texte, y, font, couleur):
    x0, _, x1, _ = d.textbbox((0, 0), texte, font=font)
    d.text(((L - (x1 - x0)) / 2 - x0, y), texte, font=font, fill=couleur)


def main():
    phrase = json.loads((RACINE / 'pokza-app' / 'public' / 'manifest.json').read_text())['description']

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

    # La phrase du manifeste est trop longue pour une ligne : on coupe sur les deux-points, qui
    # séparent justement ce qu'est Pokza de ce qu'on y fait.
    haut, bas = (phrase.split(':', 1) + [''])[:2]
    f = police(31)
    centre(d, haut.strip() + ' :', 430, f, PARCHEMIN_ESTOMPE)
    centre(d, bas.strip(), 478, f, PARCHEMIN_ESTOMPE)

    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    img.save(SORTIE, optimize=True)
    print(f'{SORTIE.relative_to(RACINE)} — {SORTIE.stat().st_size // 1024} Ko, {L}x{H}')


if __name__ == '__main__':
    main()

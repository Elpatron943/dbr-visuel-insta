#!/usr/bin/env python3
"""Couverture d'un réel DBR (décision du fondateur du 24 oct. 2026).

Une image 1080 x 1920 tirée de la vidéo, avec un texte court et très visible qui attire l'attention
et différencie les réels entre eux dans la grille du profil.

  python3 tools/couverture/couverture.py reel.mp4 cover.jpg --at 6.2 \
      --text "Ton Champion|ne signe rien" --gold "Champion" --tag "Construire un Champion" --format A

- --text : 2 ou 3 lignes séparées par « | », 6 mots au plus au total, différent du titre d'accroche de la vidéo.
- --gold : mot(s) à mettre en or (séparés par des virgules).
- --tag : étiquette du sujet en haut (court).
- --format : A, B ou C (couleur de l'étiquette : or, turquoise, corail) pour varier la grille.
- Tout le texte reste dans la zone visible de la grille Instagram (recadrage 3:4 au centre, y de 240 à 1680).
"""
import argparse, os, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "habillage", "fonts")
W, H = 1080, 1920
GOLD = (245, 197, 66)
WHITE = (250, 250, 250)
INK = (10, 10, 13)
TAGS = {"A": GOLD, "B": (64, 200, 196), "C": (255, 122, 92)}


def frame(video, at):
    out = os.path.join(tempfile.mkdtemp(), "f.png")
    subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-ss", str(at), "-i", video, "-frames:v", "1", out])
    im = Image.open(out).convert("RGB")
    # léger zoom sur le visage (haut de l'image) pour une couverture plus « serrée »
    z = 1.12
    im = im.resize((int(im.width * z * W / im.width), int(im.height * z * W / im.width)), Image.LANCZOS)
    x = (im.width - W) // 2
    y = int((im.height - H) * 0.25)
    return im.crop((x, y, x + W, y + H))


def fit_font(draw, lines, path, max_w, start=150, min_size=84):
    size = start
    while size > min_size:
        f = ImageFont.truetype(path, size)
        if all(draw.textlength(l, font=f) <= max_w for l in lines):
            return f
        size -= 4
    return ImageFont.truetype(path, min_size)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video"); p.add_argument("out")
    p.add_argument("--at", type=float, default=5.0)
    p.add_argument("--text", required=True)
    p.add_argument("--gold", default="")
    p.add_argument("--tag", default="")
    p.add_argument("--format", default="A")
    a = p.parse_args()

    im = frame(a.video, a.at)
    # assombrir le bas pour la lisibilité
    grad = Image.new("L", (1, H))
    for yy in range(H):
        grad.putpixel((0, yy), int(max(0, (yy - H * 0.42) / (H * 0.58)) ** 1.3 * 200))
    shade = Image.new("RGB", (W, H), INK)
    im = Image.composite(shade, im, grad.resize((W, H)))
    d = ImageDraw.Draw(im)

    heavy = os.path.join(FONTS, "DBRManrope-Heavy.ttf")
    lines = [l.strip().upper() for l in a.text.split("|") if l.strip()]
    gold = {g.strip().upper() for g in a.gold.split(",") if g.strip()}
    f = fit_font(d, lines, heavy, W - 140)
    lh = int(f.size * 1.18)
    total = lh * len(lines)
    y0 = 1450 - total  # bas du bloc vers y = 1450, dans la zone 3:4 et au-dessus de l'interface
    for i, line in enumerate(lines):
        words = line.split()
        widths = [d.textlength(w, font=f) for w in words]
        space = d.textlength(" ", font=f)
        lw = sum(widths) + space * (len(words) - 1)
        x = (W - lw) / 2
        y = y0 + i * lh
        pad = 22
        d.rounded_rectangle((x - pad, y - 6, x + lw + pad, y + lh - 14), radius=18, fill=INK + (0,))
        for w, ww in zip(words, widths):
            col = GOLD if w.strip(".,!?:;…»«") in gold else WHITE
            d.text((x, y), w, font=f, fill=col)
            x += ww + space

    if a.tag:
        tf = ImageFont.truetype(heavy, 44)
        t = a.tag.upper()
        tw = d.textlength(t, font=tf)
        col = TAGS.get(a.format.upper(), GOLD)
        x, y = (W - tw) / 2, 1450 - total - 110
        d.rounded_rectangle((x - 28, y - 14, x + tw + 28, y + 62), radius=38, fill=col)
        d.text((x, y), t, font=tf, fill=INK)

    # filet or en bas, comme la barre de progression des réels
    d.rectangle((0, H - 14, W, H), fill=GOLD)
    im.save(a.out, "JPEG", quality=92)
    print(f"ok {a.out}")


if __name__ == "__main__":
    main()

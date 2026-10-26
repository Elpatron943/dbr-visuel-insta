#!/usr/bin/env python3
"""Met une image (ex. première image d'un carrousel 1080 x 1350) au format story 1080 x 1920.

Usage : python3 tools/story/frame.py <image source> <image story .jpg>

Fond : la même image agrandie, floutée et assombrie ; l'image d'origine est centrée au premier plan, sans recadrage.
"""
import sys
from PIL import Image, ImageFilter, ImageEnhance

W, H = 1080, 1920

src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGB")

# fond : image agrandie pour couvrir tout le cadre, floutée, assombrie
scale = max(W / img.width, H / img.height)
bg = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
left, top = (bg.width - W) // 2, (bg.height - H) // 2
bg = bg.crop((left, top, left + W, top + H)).filter(ImageFilter.GaussianBlur(40))
bg = ImageEnhance.Brightness(bg).enhance(0.55)

# premier plan : image entière, à la largeur du cadre
fg_scale = min(W / img.width, H / img.height)
fg = img.resize((round(img.width * fg_scale), round(img.height * fg_scale)), Image.LANCZOS)
bg.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2))
bg.save(out, "JPEG", quality=92, optimize=True)
print(f"{out} : {W}x{H}")

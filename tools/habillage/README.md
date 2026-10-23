# Habillage des réels DBR

`python3 tools/habillage/habiller.py video_brute.mp4 sous_titres.srt sortie.mp4 --hook "Accroche de 8 mots au plus" --zooms 3.2-4.5,12.0-14.0`

- Entrées : la vidéo HeyGen **sans** sous-titres incrustés (`video_url`) et le fichier `.srt` de HeyGen (`subtitle_url`).
- Ajoute : zoom franc dès la première image (accroche visuelle), sous-titres dynamiques mot par mot (Manrope, mot prononcé et mots clés en or #F5C542), titre d'accroche en haut pendant 2,8 s, zoom lent continu + zooms francs sur les intervalles donnés, barre de progression or, bruitages discrets (souffle à l'ouverture, « pop » à chaque zoom).
- Prérequis : ffmpeg avec libass (filtre `ass`), Python 3.
- Polices : Manrope (SIL Open Font License), renommées « DBR Manrope » pour libass.

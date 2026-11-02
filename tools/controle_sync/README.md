# Contrôle de synchronisation bouche et voix

Vérifie qu'un réel avatar a la bouche calée sur la voix, sans dépenser de crédit HeyGen (environ une minute).

## Usage

```
python3 -I controle_sync.py brut.mp4 [--habille reel.mp4] [--srt sous.srt] [--planche planche.png]
```

- `brut.mp4` : la vidéo HeyGen avant habillage. C'est elle qu'on mesure (zooms et sous-titres faussent la mesure).
- `--habille` : la vidéo habillée. Le script vérifie seulement que l'habillage n'a décalé ni le son ni la durée.
- `--srt` : le fichier .srt de HeyGen, pour choisir les instants de la planche d'images.
- `--planche` : l'image à regarder ensuite (par défaut `planche_synchro.png`).

## Verdicts

Le script écrit une ligne JSON avec un verdict :

- `OK` : écart à la référence sous 80 ms.
- `A_REGARDER` : écart entre 80 et 160 ms, ou mesure peu fiable. Regarder la planche avant toute suite.
- `ECHEC` : écart de 160 ms ou plus, piste manquante, ou habillage qui change la durée. Code de sortie 2.

`A_REGARDER` et `ECHEC` bloquent la publication (contrôle qualité des réels du 30 oct. 2026).

## Prérequis

ffmpeg et ffprobe, puis `numpy` et `Pillow` pour Python.

## Référence à recaler

`REF_MS` (-240 ms) est le biais propre à la méthode, mesuré sur les réels HeyGen du 23 et du 25 oct. 2026. Seul l'écart à cette valeur compte. Elle est à recaler avec les 10 premiers réels jugés bons.

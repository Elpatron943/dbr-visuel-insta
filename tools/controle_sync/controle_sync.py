#!/usr/bin/env python3
"""Contrôle de synchronisation bouche / voix d'un réel avatar DBR (0 crédit, environ 1 min).

Usage :
  python3 -I controle_sync.py brut.mp4 [--habille reel.mp4] [--srt sous.srt] [--planche planche.png] [--roi x,y,w,h]

- brut.mp4   : vidéo HeyGen avant habillage (c'est elle qu'on mesure : zooms et sous-titres faussent la mesure).
- --habille  : vidéo habillée ; on vérifie seulement que l'habillage n'a décalé ni le son ni la durée.
- --srt      : fichier .srt de HeyGen, pour choisir les instants de la planche d'images.
- Sortie     : une ligne JSON (verdict OK / A_REGARDER / ECHEC) + la planche d'images à regarder (outil Read).

Méthode : corrélation croisée entre l'enveloppe du volume de la voix et le mouvement de la zone de la bouche
(image par image, 25 i/s). Le décalage absolu de cette méthode a un biais connu (REF_MS), mesuré sur les réels HeyGen du
23 et du 25 oct. 2026 : seul l'ÉCART à cette référence compte. Un décalage artificiel de la voix de ±200 ms a été
retrouvé à ±200 ms (test du 24 oct. 2026). Prérequis : ffmpeg, ffprobe, numpy, Pillow.
"""
import argparse, json, re, subprocess, sys
import numpy as np

FPS = 25
REF_MS = -240        # pic mesuré sur les réels HeyGen jugés bons par le fondateur (à recaler avec les 10 prochains réels)
TOL_OK_MS = 80       # écart toléré à la référence
TOL_FAIL_MS = 160    # au-delà : échec
CORR_MIN = 0.25      # en dessous, la mesure est peu fiable : regarder la planche
DEFAULT_ROI = "380,590,300,180"   # x,y,w,h de la bouche dans le cadrage standard de la tenue de référence


def probe(path):
    d = json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
                                            "stream=codec_type,start_time,duration,avg_frame_rate", "-of", "json", path]))
    s = {x["codec_type"]: x for x in d["streams"]}
    return {k: {"start": float(v.get("start_time", 0)), "dur": float(v.get("duration", 0))} for k, v in s.items()}


def container_checks(path, label):
    p = probe(path)
    issues = []
    if "audio" not in p or "video" not in p:
        return {"fichier": label, "erreurs": ["piste audio ou vidéo absente"]}, p
    if abs(p["audio"]["start"] - p["video"]["start"]) > 0.08:
        issues.append(f"départ son/image décalé de {abs(p['audio']['start'] - p['video']['start']) * 1000:.0f} ms")
    if abs(p["audio"]["dur"] - p["video"]["dur"]) > 0.15:
        issues.append(f"durées son/image différentes de {abs(p['audio']['dur'] - p['video']['dur']) * 1000:.0f} ms")
    return {"fichier": label, "ecart_duree_ms": round((p["audio"]["dur"] - p["video"]["dur"]) * 1000), "erreurs": issues}, p


def audio_env(path):
    raw = subprocess.check_output(["ffmpeg", "-loglevel", "error", "-i", path, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"])
    a = np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
    hop = 16000 // FPS
    n = len(a) // hop
    return np.sqrt((a[: n * hop].reshape(n, hop) ** 2).mean(axis=1))


def mouth_motion(path, roi):
    x, y, w, h = roi
    p = subprocess.Popen(["ffmpeg", "-loglevel", "error", "-i", path, "-an", "-vf",
                          f"fps={FPS},crop={w}:{h}:{x}:{y},format=gray", "-f", "rawvideo", "-"], stdout=subprocess.PIPE)
    frames, size = [], w * h
    while True:
        b = p.stdout.read(size)
        if len(b) < size:
            break
        frames.append(np.frombuffer(b, np.uint8).astype(np.float32))
    f = np.array(frames)
    return np.concatenate([[0], np.abs(np.diff(f, axis=0)).mean(axis=1)])


def smooth(x, k=3):
    return np.convolve(x, np.ones(k) / k, mode="same")


def z(x):
    x = x - x.mean()
    s = x.std()
    return x / s if s > 0 else x


def mouth_voice(path, roi, maxlag=16):
    env, mov = smooth(audio_env(path)), smooth(mouth_motion(path, roi))
    n = min(len(env), len(mov))
    env, mov = z(env[:n]), z(mov[:n])
    res = {}
    for lag in range(-maxlag, maxlag + 1):   # lag > 0 : la bouche bouge après la voix
        res[lag] = float(np.mean(env[: n - lag] * mov[lag:])) if lag >= 0 else float(np.mean(env[-lag:] * mov[: n + lag]))
    best = max(res, key=res.get)
    quiet = env < np.percentile(env, 20)
    return {"pic_ms": best * 1000 // FPS, "corr_pic": round(res[best], 3),
            "mouvement_bouche_en_silence": round(float(mov[quiet].mean() - mov.mean()), 2)}


def srt_chunks(path):
    ts = lambda s: (lambda h, m, r: int(h) * 3600 + int(m) * 60 + int(r.split(",")[0]) + int(r.split(",")[1]) / 1000)(*s.split(":"))
    out = []
    for b in re.split(r"\n\s*\n", open(path, encoding="utf-8").read().strip()):
        ln = b.strip().splitlines()
        if len(ln) >= 3:
            a, z_ = [t.strip() for t in ln[1].split("-->")]
            out.append((ts(a), ts(z_), " ".join(ln[2:])))
    return out


def planche(video, times, out_png):
    from PIL import Image, ImageDraw
    tiles = []
    for t in times:
        raw = subprocess.check_output(["ffmpeg", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1",
                                       "-vf", "crop=580:480:250:330,scale=360:-1", "-f", "image2pipe", "-vcodec", "png", "-"])
        import io
        im = Image.open(io.BytesIO(raw)).convert("RGB")
        ImageDraw.Draw(im).text((8, 8), f"{t:.1f}s", fill=(245, 197, 66))
        tiles.append(im)
    w, h = tiles[0].size
    cols = 3
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (w * cols, h * rows))
    for i, im in enumerate(tiles):
        sheet.paste(im, ((i % cols) * w, (i // cols) * h))
    sheet.save(out_png)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("brut")
    ap.add_argument("--habille")
    ap.add_argument("--srt")
    ap.add_argument("--planche", default="planche_synchro.png")
    ap.add_argument("--roi", default=DEFAULT_ROI)
    a = ap.parse_args()
    roi = tuple(int(v) for v in a.roi.split(","))
    out = {"verdict": "OK", "raisons": []}

    c_brut, p_brut = container_checks(a.brut, "brut")
    out["fichiers"] = [c_brut]
    if c_brut["erreurs"]:
        out["verdict"] = "ECHEC"; out["raisons"] += c_brut["erreurs"]
    if a.habille:
        c_hab, p_hab = container_checks(a.habille, "habille")
        out["fichiers"].append(c_hab)
        if c_hab["erreurs"]:
            out["verdict"] = "ECHEC"; out["raisons"] += [f"habillé : {e}" for e in c_hab["erreurs"]]
        if "video" in p_brut and "video" in p_hab:
            d = abs(p_hab["video"]["dur"] - p_brut["video"]["dur"]) * 1000
            da = abs(p_hab["audio"]["dur"] - p_brut["audio"]["dur"]) * 1000
            out["habillage_ecart_duree_image_ms"], out["habillage_ecart_duree_son_ms"] = round(d), round(da)
            if d > 60 or da > 100:
                out["verdict"] = "ECHEC"; out["raisons"].append("l'habillage a modifié la durée de la vidéo ou du son")

    m = mouth_voice(a.brut, roi)
    out["bouche_voix"] = m
    ecart = abs(m["pic_ms"] - REF_MS)
    out["ecart_a_la_reference_ms"] = ecart
    if ecart >= TOL_FAIL_MS:
        out["verdict"] = "ECHEC"; out["raisons"].append(f"décalage bouche/voix de {ecart} ms par rapport à la référence")
    elif ecart >= TOL_OK_MS and out["verdict"] == "OK":
        out["verdict"] = "A_REGARDER"; out["raisons"].append(f"décalage bouche/voix de {ecart} ms : regarder la planche")
    if m["corr_pic"] < CORR_MIN and out["verdict"] == "OK":
        out["verdict"] = "A_REGARDER"; out["raisons"].append("mesure peu fiable (corrélation faible) : regarder la planche")

    dur = p_brut["video"]["dur"]
    if a.srt:
        ch = [c for c in srt_chunks(a.srt) if c[1] - c[0] > 0.5]
        step = max(1, len(ch) // 6)
        times = [(c[0] + c[1]) / 2 for c in ch[::step][:6]]
    else:
        times = [dur * (i + 0.5) / 6 for i in range(6)]
    planche(a.brut, times, a.planche)
    out["planche"] = a.planche
    print(json.dumps(out, ensure_ascii=False))
    sys.exit(0 if out["verdict"] != "ECHEC" else 2)


main()

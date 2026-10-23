#!/usr/bin/env python3
"""Habillage DBR d'un réel HeyGen : sous-titres dynamiques mot par mot (mot clé en or),
titre d'accroche, zooms, barre de progression or, bruitages discrets.
Usage : habiller.py video_brute.mp4 sous_titres.srt sortie.mp4 --hook "Texte" [--zooms 9.5-11,24-30] [--fonts DIR]
"""
import argparse, re, subprocess, json, os, tempfile, unicodedata

GOLD = "&H0042C5F5&"   # #F5C542 en BGR ASS
WHITE = "&H00FAFAFA&"
KEYWORDS = {"prospect", "signer", "signera", "histoire", "budget", "non", "questions", "question", "peur",
            "réponse", "commentaire", "pipeline", "forecast", "closing", "prospection", "deal", "deals",
            "commercial", "commerciaux", "client", "acheteur", "décide", "test", "moment", "trimestre", "ment"}

def ts(s):
    h, m, rest = s.split(":"); sec, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(sec) + int(ms) / 1000

def ass_t(t):
    t = max(0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"

def parse_srt(path):
    blocks = re.split(r"\n\s*\n", open(path, encoding="utf-8").read().strip())
    out = []
    for b in blocks:
        lines = b.strip().splitlines()
        if len(lines) < 3: continue
        a, z = [x.strip() for x in lines[1].split("-->")]
        text = " ".join(lines[2:])
        out.append((ts(a), ts(z), text))
    return out

def clean(word):
    return word.replace("«", "").replace("»", "").strip()

def norm(w):
    w = re.sub(r"[^\w']", "", w.lower())
    return w

def words_with_times(chunks):
    words = []
    for a, z, text in chunks:
        ws = [clean(w) for w in text.split()]
        ws = [w for w in ws if w]
        if not ws: continue
        total = sum(max(len(w), 2) for w in ws)
        t = a
        for w in ws:
            d = (z - a) * max(len(w), 2) / total
            words.append([w, t, t + d])
            t += d
    return words

def groups(words, max_words=3, max_chars=16):
    gs, cur = [], []
    for w in words:
        n_chars = sum(len(x[0]) for x in cur) + len(w[0])
        if cur and (len(cur) >= max_words or n_chars > max_chars or cur[-1][0][-1] in ".?!:"):
            gs.append(cur); cur = []
        cur.append(w)
    if cur: gs.append(cur)
    return gs

def build_ass(words, hook, dur, hook_until=2.8):
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,DBR Manrope Heavy,104,&H00FAFAFA,&H00FAFAFA,&H000A0A0D,&H96000000,0,0,0,0,100,100,0,0,1,9,4,2,50,50,500,1
Style: Hook,DBR Manrope Heavy,80,&H00FAFAFA,&H00FAFAFA,&H000A0A0D,&HD00A0A0D,0,0,0,0,100,100,0,0,3,26,0,8,110,110,120,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = []
    if hook:
        ev.append(f"Dialogue: 2,{ass_t(0)},{ass_t(hook_until)},Hook,,0,0,0,,{{\\fad(120,250)\\t(0,180,\\fscx104\\fscy104)\\t(180,320,\\fscx100\\fscy100)}}{hook.upper()}")
    for g in groups(words):
        g_end = g[-1][2]
        for i, (w, a, z) in enumerate(g):
            end = g[i + 1][1] if i + 1 < len(g) else g_end + 0.12
            parts = []
            for j, (wj, _, _) in enumerate(g):
                txt = wj.upper()
                if j == i:
                    col = GOLD
                    parts.append(f"{{\\c{col}\\fscx100\\fscy100\\t(0,90,\\fscx116\\fscy116)\\t(90,180,\\fscx108\\fscy108)}}{txt}")
                elif j < i:
                    col = GOLD if norm(wj) in KEYWORDS else WHITE
                    parts.append(f"{{\\c{col}\\fscx100\\fscy100}}{txt}")
                else:
                    parts.append(f"{{\\c{WHITE}\\alpha&H60&\\fscx100\\fscy100}}{txt}{{\\alpha&H00&}}")
            ev.append(f"Dialogue: 1,{ass_t(a)},{ass_t(end)},Cap,,0,0,0,,{' '.join(parts)}")
    return head + "\n".join(ev) + "\n"

def main():
    p = argparse.ArgumentParser()
    p.add_argument("video"); p.add_argument("srt"); p.add_argument("out")
    p.add_argument("--hook", default="")
    p.add_argument("--zooms", default="", help="intervalles en secondes, ex 9.5-11,24-30")
    p.add_argument("--fonts", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts"))
    a = p.parse_args()

    dur = float(json.loads(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", a.video]))["format"]["duration"])
    words = words_with_times(parse_srt(a.srt))
    tmp = tempfile.mkdtemp()
    ass = os.path.join(tmp, "habillage.ass")
    open(ass, "w", encoding="utf-8").write(build_ass(words, a.hook, dur))

    zooms = [tuple(map(float, z.split("-"))) for z in a.zooms.split(",") if z]
    # accroche visuelle : zoom franc dès la première image (0 à 0,7 s), toujours présent
    if not any(x <= 0.1 for x, _ in zooms):
        zooms = [(0.0, 0.7)] + zooms
    zexpr = "1" + "".join(f"+0.10*between(t,{x},{y})" for x, y in zooms) if zooms else "1"
    # zoom léger permanent (1,02 → 1,05) pour donner du mouvement, + zooms francs sur les phrases fortes
    z = f"({zexpr})*(1.02+0.03*t/{dur:.2f})"
    vf = (
        f"scale=w='trunc(iw*{z}/2)*2':h='trunc(ih*{z}/2)*2':eval=frame,"
        f"crop=1080:1920:'(iw-1080)/2':'(ih-1920)/2.6',"
        f"ass={ass}:fontsdir={a.fonts},"
        f"drawbox=x=0:y=ih-14:w='iw*t/{dur:.3f}':h=14:color=0xF5C542@0.95:t=fill"
    )
    # bruitages : un « whoosh » à l'ouverture, un « pop » à chaque zoom
    pops = [0.05] + [x for x, _ in zooms if x > 0.1]
    sfx_inputs, sfx_labels = [], []
    for k, t0 in enumerate(pops):
        if k == 0:
            src = "anoisesrc=d=0.45:c=pink:a=0.35,highpass=f=900,lowpass=f=5000,afade=t=in:d=0.15,afade=t=out:st=0.2:d=0.25"
        else:
            src = "sine=f=880:d=0.12,afade=t=out:st=0.03:d=0.09,volume=0.35"
        sfx_inputs += ["-f", "lavfi", "-i", src]
    fc_audio = "".join(f"[{k+1}:a]adelay={int(t0*1000)}|{int(t0*1000)},aformat=channel_layouts=stereo[s{k}];" for k, t0 in enumerate(pops))
    mix_in = "[0:a]" + "".join(f"[s{k}]" for k in range(len(pops)))
    fc = f"[0:v]{vf}[v];{fc_audio}{mix_in}amix=inputs={len(pops)+1}:duration=first:normalize=0[a]"
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", a.video, *sfx_inputs, "-filter_complex", fc,
           "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p",
           "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", a.out]
    subprocess.check_call(cmd)
    print(f"ok {a.out} ({dur:.1f} s, {len(words)} mots)")

if __name__ == "__main__":
    main()

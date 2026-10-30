// Publie sur Instagram les carrousels et les réels préparés par Nora, UNIQUEMENT s'ils ont été validés.
// Un carrousel = instagram/<slug>/post.json + 2 à 10 images JPEG dans le même dossier.
// post.json : { "publish_at": "2026-10-14T10:15:00Z", "approved": false, "caption": "…", "images": ["01.jpg", …], "approval_id": "…" }
// Un réel = instagram/<slug>/post.json + une vidéo MP4 (9:16) dans le même dossier.
// post.json : { "type": "reel", "publish_at": "…", "approved": false, "caption": "…", "video": "reel.mp4", "approval_id": "…" }
// Republication (scripts/republish-instagram.mjs) : post.json peut contenir "republication_of": "<dossier d'origine>". Le dossier ne contient alors
// que post.json (puis published.json) : la vidéo, la couverture et les images sont lues dans le dossier d'origine (pas de copie de fichiers lourds).
// Le dépôt est public : ce script ne doit JAMAIS écrire le jeton ni une URL qui le contient dans les journaux.
import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_ID = process.env.IG_USER_ID;
const HOST = process.env.IG_GRAPH_HOST || "https://graph.instagram.com";
const VERSION = process.env.IG_GRAPH_VERSION || "v23.0";
const REPO = process.env.GITHUB_REPOSITORY; // Elpatron943/dbr-visuel-insta
const MAX_LATE_DAYS = 7;

// Garde-fous de diffusion (audit réseaux du 28 oct. 2026) :
// - au plus une publication par jour (heure de Paris), sauf "hors_quota": true dans post.json ;
// - jamais la nuit : publication seulement entre OPEN_HOUR et CLOSE_HOUR (heure de Paris), sinon on attend le prochain passage ;
// - pas deux fois le même sujet (même première ligne de légende) en moins de REPEAT_DAYS jours, hors "republication_of"
//   (les republications suivent leurs propres règles, voir scripts/republish-instagram.mjs) ;
// - légende refusée si elle contient un émoji, une flèche, un tiret long ou un demi-cadratin (règle de marque).
// Un contenu retenu par un garde-fou n'est ni publié ni écarté : il attend, ou il faut corriger son post.json.
// Contrôle qualité des réels (fondateur, 30 oct. 2026, après un « POC » mal prononcé) : un réel neuf (hors "republication_of")
// n'est publié que si son post.json porte "controle_qualite": "ok" (posé par Nora quand tous les contrôles de voix, de
// prononciation et de synchro sont OK, aucun point « à regarder ») et "texte_lu" (le texte exact envoyé à la voix).
// Le texte lu est revérifié ici : aucun sigle hors du lexique validé (CRM, DAF, DSI), jamais « poc ».
const OPEN_HOUR = 7;
const CLOSE_HOUR = 21;
const REPEAT_DAYS = 60;
const SIGLES_VALIDES = new Set(["CRM", "DAF", "DSI"]);
function siglesInterdits(texte) {
  const t = String(texte || "");
  const out = new Set((t.match(/\b[A-Z]{2,5}\b/g) || []).filter((m) => !SIGLES_VALIDES.has(m)));
  if (/\bpocs?\b/i.test(t)) out.add("POC");
  return [...out];
}
const FORBIDDEN = /[–—←-⇿➔-➿⬅-⬇☀-➿️]|\p{Extended_Pictographic}/u;

const parisFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
function paris(t) {
  const p = Object.fromEntries(parisFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24 };
}
const firstLine = (c) => String(c || "").split("\n")[0].trim().toLowerCase().replace(/\s+/g, " ");
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };

const root = "instagram";
const dirs = fs.existsSync(root) ? fs.readdirSync(root).map((d) => path.join(root, d)).filter((d) => fs.existsSync(path.join(d, "post.json"))) : [];
const now = Date.now();

// Ce qui est déjà publié : date et première ligne de légende.
const published = [];
for (const dir of dirs) {
  const p = readJson(path.join(dir, "published.json"));
  if (!p) continue;
  const at = Date.parse(p.at);
  if (Number.isFinite(at)) published.push({ dir, at, line: firstLine(readJson(path.join(dir, "post.json"))?.caption) });
}
const today = paris(now);
const publishedToday = published.some((p) => paris(p.at).day === today.day);
const nightTime = today.hour < OPEN_HOUR || today.hour >= CLOSE_HOUR;

let held = 0;
const due = [];
for (const dir of dirs) {
  if (fs.existsSync(path.join(dir, "published.json")) || fs.existsSync(path.join(dir, "skipped.json"))) continue;
  const m = JSON.parse(fs.readFileSync(path.join(dir, "post.json"), "utf8"));
  if (m.approved !== true) continue; // pas validé : on ne touche à rien
  const at = Date.parse(m.publish_at);
  if (!Number.isFinite(at) || at > now) continue; // pas encore l'heure
  if (now - at > MAX_LATE_DAYS * 864e5) {
    fs.writeFileSync(path.join(dir, "skipped.json"), JSON.stringify({ reason: `validé trop tard (plus de ${MAX_LATE_DAYS} jours après la date prévue) : à replanifier`, at: new Date().toISOString() }, null, 1));
    console.log(`::warning::${dir} : date dépassée de plus de ${MAX_LATE_DAYS} jours, non publié`);
    continue;
  }
  if (FORBIDDEN.test(String(m.caption || ""))) {
    held++;
    console.log(`::error::${dir} : légende avec émoji, flèche ou tiret long, à corriger avant publication`);
    continue;
  }
  if (m.type === "reel" && !m.republication_of) {
    const sigles = siglesInterdits(m.texte_lu);
    if (m.controle_qualite !== "ok" || !String(m.texte_lu || "").trim() || sigles.length) {
      held++;
      const why = m.controle_qualite !== "ok" ? "controle_qualite différent de \"ok\"" : !String(m.texte_lu || "").trim() ? "texte_lu absent" : `sigle non validé dans le texte lu (${sigles.join(", ")})`;
      console.log(`::error::${dir} : contrôle qualité du réel non passé (${why}), non publié`);
      continue;
    }
  }
  if (!m.republication_of) {
    const line = firstLine(m.caption);
    const twin = line && published.find((p) => p.line === line && now - p.at < REPEAT_DAYS * 864e5);
    if (twin) {
      held++;
      console.log(`::warning::${dir} : même sujet que ${twin.dir}, publié il y a moins de ${REPEAT_DAYS} jours, non publié`);
      continue;
    }
  }
  due.push({ dir, m });
}
if (!due.length) { console.log("Aucun carrousel validé à publier maintenant."); process.exit(0); }
const forced = due.filter(({ m }) => m.hors_quota === true);
if (nightTime) { console.log(`Il est ${today.hour} h à Paris : aucune publication avant ${OPEN_HOUR} h ni après ${CLOSE_HOUR} h, ${due.length} contenu(s) en attente.`); process.exit(0); }
if (publishedToday && !forced.length) { console.log(`Déjà une publication aujourd'hui (heure de Paris) : ${due.length} contenu(s) attendent demain. Exception possible avec "hors_quota": true.`); process.exit(0); }
if (publishedToday) due.splice(0, due.length, ...forced);
if (!TOKEN || !IG_ID) { console.error("::error::Secrets IG_ACCESS_TOKEN et IG_USER_ID requis (Settings → Secrets and variables → Actions)."); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function graph(method, p, params = {}) {
  const url = new URL(`${HOST}/${VERSION}/${p}`);
  const body = new URLSearchParams({ ...params, access_token: TOKEN });
  let res;
  if (method === "GET") { for (const [k, v] of body) url.searchParams.set(k, v); res = await fetch(url); }
  else res = await fetch(url, { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`${method} /${p.split("?")[0]} → ${res.status} ${e.type || ""} ${e.code || ""} ${e.message || ""}`.trim());
  }
  return json;
}
async function waitFinished(id, label, tries = 30) {
  for (let i = 0; i < tries; i++) {
    const s = await graph("GET", id, { fields: "status_code" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`${label} : statut ${s.status_code}`);
    await sleep(4000);
  }
  throw new Error(`${label} : traitement trop long`);
}

let failures = 0;
for (const { dir, m } of due.slice(0, 1)) { // une seule publication par passage
  try {
    // Dossier des médias : le dossier lui-même, ou le dossier d'origine pour une republication (même contenu, mêmes fichiers).
    let mediaDir = dir;
    if (m.republication_of) {
      const src = String(m.republication_of);
      if (!/^[a-z0-9][a-z0-9-]*$/.test(src)) throw new Error(`republication_of invalide : ${src}`);
      mediaDir = path.join(root, src);
      if (!fs.existsSync(path.join(mediaDir, "post.json"))) throw new Error(`dossier d'origine introuvable : ${src}`);
    }
    if (m.type === "reel") {
      const video = String(m.video || "");
      if (!/\.mp4$/i.test(video)) throw new Error("réel : il faut une vidéo .mp4 (champ video)");
      if (!fs.existsSync(path.join(mediaDir, video))) throw new Error(`vidéo manquante : ${video}`);
      const caption = String(m.caption || "");
      if (caption.length > 2200) throw new Error("légende de plus de 2 200 caractères");
      if ((caption.match(/#/g) || []).length > 30) throw new Error("plus de 30 hashtags");
      const videoUrl = `https://raw.githubusercontent.com/${REPO}/${process.env.GITHUB_SHA}/${mediaDir}/${encodeURIComponent(video)}`;
      const params = { media_type: "REELS", video_url: videoUrl, caption, share_to_feed: "true" };
      // couverture personnalisée (texte visible) : cover.jpg dans le dossier, champ "cover" de post.json
      if (m.cover && fs.existsSync(path.join(mediaDir, m.cover))) params.cover_url = `https://raw.githubusercontent.com/${REPO}/${process.env.GITHUB_SHA}/${mediaDir}/${encodeURIComponent(m.cover)}`;
      const reel = await graph("POST", `${IG_ID}/media`, params);
      await waitFinished(reel.id, "réel", 90); // jusqu'à 6 minutes de traitement vidéo
      const pub = await graph("POST", `${IG_ID}/media_publish`, { creation_id: reel.id });
      let permalink = null;
      try { permalink = (await graph("GET", pub.id, { fields: "permalink" })).permalink || null; } catch {}
      fs.writeFileSync(path.join(dir, "published.json"), JSON.stringify({ media_id: pub.id, permalink, approval_id: m.approval_id || null, at: new Date().toISOString() }, null, 1));
      console.log(`${dir} : réel publié sur Instagram ${permalink || pub.id}`);
      continue;
    }
    const images = (m.images || []).filter((f) => /\.jpe?g$/i.test(f));
    if (images.length < 2 || images.length > 10) throw new Error(`il faut 2 à 10 images JPEG (trouvé ${images.length})`);
    for (const f of images) if (!fs.existsSync(path.join(mediaDir, f))) throw new Error(`image manquante : ${f}`);
    const caption = String(m.caption || "");
    if (caption.length > 2200) throw new Error("légende de plus de 2 200 caractères");
    if ((caption.match(/#/g) || []).length > 30) throw new Error("plus de 30 hashtags");
    const sha = process.env.GITHUB_SHA;
    const base = `https://raw.githubusercontent.com/${REPO}/${sha}/${mediaDir}`;

    const children = [];
    for (const f of images) {
      const c = await graph("POST", `${IG_ID}/media`, { image_url: `${base}/${encodeURIComponent(f)}`, is_carousel_item: "true" });
      children.push(c.id);
    }
    for (const id of children) await waitFinished(id, "image");
    const carousel = await graph("POST", `${IG_ID}/media`, { media_type: "CAROUSEL", children: children.join(","), caption });
    await waitFinished(carousel.id, "carrousel");
    const pub = await graph("POST", `${IG_ID}/media_publish`, { creation_id: carousel.id });
    let permalink = null;
    try { permalink = (await graph("GET", pub.id, { fields: "permalink" })).permalink || null; } catch {}
    fs.writeFileSync(path.join(dir, "published.json"), JSON.stringify({ media_id: pub.id, permalink, approval_id: m.approval_id || null, at: new Date().toISOString() }, null, 1));
    console.log(`${dir} : publié sur Instagram ${permalink || pub.id}`);
  } catch (e) {
    failures++;
    console.error(`::error::${dir} : ÉCHEC, ${e.message}`);
  }
}
process.exit(failures ? 1 : 0);

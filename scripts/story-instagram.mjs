// Publie chaque jour en story Instagram un contenu DEJA PUBLIE (réel ou carrousel), à l'identique (demande du fondateur du 26 oct. 2026).
// Deux étapes, appelées par .github/workflows/story-instagram.yml :
//   node scripts/story-instagram.mjs prepare : choisit le contenu du jour, écrit stories/<date>/story.json et, pour un carrousel, la
//                                              image 9:16 stories/frames/<dossier>.jpg (tools/story/frame.py). Aucun appel à Instagram.
//   node scripts/story-instagram.mjs publish : publie la story du jour (média lu à l'adresse raw.githubusercontent.com du commit courant)
//                                              puis écrit stories/<date>/published.json.
// Règles :
// - source : dossier instagram/<slug> avec published.json, jamais une republication, sans "no_republish": true ni "no_story": true ;
// - rotation : le contenu jamais utilisé en story d'abord, puis le moins récemment utilisé, à égalité le plus vu (stats/instagram-latest.json) ;
// - une seule story par jour (date de Paris) ; les stories n'ont pas de légende ;
// - arrêt d'urgence : créer le fichier stories/PAUSE (ou désactiver l'action). Annuler la story du jour avant son heure : créer stories/<date>/skipped.json.
// Dépôt public : ce script ne doit JAMAIS écrire le jeton ni une URL qui le contient dans les journaux.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const MODE = process.argv[2];
const ROOT = "instagram";
const STORIES = "stories";
const PAUSE = path.join(STORIES, "PAUSE");
const NOW = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
const DRY = process.env.DRY_RUN === "1";
const MIN_AGE_DAYS = Number.isFinite(Number(process.env.MIN_AGE_DAYS)) && String(process.env.MIN_AGE_DAYS || "").trim() !== "" ? Number(process.env.MIN_AGE_DAYS) : 1;
const DAY = 864e5;

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const parisDate = (t) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t)); // AAAA-MM-JJ
const today = parisDate(NOW);
const todayDir = path.join(STORIES, today);

if (!["prepare", "publish"].includes(MODE)) { console.error("Usage : node scripts/story-instagram.mjs prepare|publish"); process.exit(2); }
if (fs.existsSync(PAUSE)) { console.log("stories/PAUSE présent : aucune story."); process.exit(0); }
if (fs.existsSync(path.join(todayDir, "skipped.json"))) { console.log(`Story du ${today} annulée (skipped.json).`); process.exit(0); }
if (fs.existsSync(path.join(todayDir, "published.json"))) { console.log(`Story du ${today} déjà publiée.`); process.exit(0); }

// ---------------------------------------------------------------- prepare
if (MODE === "prepare") {
  const dirs = fs.existsSync(ROOT) ? fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, "post.json"))) : [];
  const originals = [];
  for (const slug of dirs) {
    const dir = path.join(ROOT, slug);
    const m = readJson(path.join(dir, "post.json"), {});
    if (m.republication_of || m.no_republish === true || m.no_story === true) continue;
    const pub = readJson(path.join(dir, "published.json"));
    if (!pub || fs.existsSync(path.join(dir, "skipped.json"))) continue;
    const at = Date.parse(pub.at);
    if (!Number.isFinite(at) || NOW - at < MIN_AGE_DAYS * DAY) continue;
    const isReel = m.type === "reel";
    const media = isReel ? m.video : (m.images || [])[0];
    if (!media || !fs.existsSync(path.join(dir, media))) continue;
    originals.push({ slug, m, pub, at, isReel, media });
  }
  if (!originals.length) { console.log("Aucun contenu publié disponible pour une story."); process.exit(0); }

  // dernière utilisation de chaque source en story
  const lastUse = new Map();
  if (fs.existsSync(STORIES)) {
    for (const d of fs.readdirSync(STORIES)) {
      const s = readJson(path.join(STORIES, d, "story.json"));
      if (!s || !s.source || fs.existsSync(path.join(STORIES, d, "skipped.json"))) continue;
      const t = Date.parse(d);
      if (Number.isFinite(t)) lastUse.set(s.source, Math.max(lastUse.get(s.source) || 0, t));
    }
  }
  const stats = readJson(path.join("stats", "instagram-latest.json"), { media: [] });
  const views = new Map((stats.media || []).filter((x) => x.permalink).map((x) => [x.permalink, Number(x.views) || 0]));
  const ranked = originals
    .map((o) => ({ ...o, last: lastUse.get(o.slug) || 0, views: views.has(o.pub.permalink) ? views.get(o.pub.permalink) : -1 }))
    .sort((a, b) => a.last - b.last || b.views - a.views || a.at - b.at);
  const src = ranked[0];

  const story = { source: src.slug, kind: src.isReel ? "reel" : "carrousel", date: today };
  if (src.isReel) {
    story.video = `${ROOT}/${src.slug}/${src.media}`;
  } else {
    story.image = `${STORIES}/frames/${src.slug}.jpg`;
  }
  console.log(`Story du ${today} : ${src.slug} (${story.kind}, ${src.last ? "dernière story le " + parisDate(src.last) : "jamais utilisé en story"}, vues ${src.views < 0 ? "inconnues" : src.views})`);
  if (DRY) { console.log("Essai à blanc : rien n'est écrit."); process.exit(0); }

  if (!src.isReel) {
    fs.mkdirSync(path.join(STORIES, "frames"), { recursive: true });
    execFileSync("python3", ["tools/story/frame.py", path.join(ROOT, src.slug, src.media), story.image], { stdio: "inherit" });
  }
  fs.mkdirSync(todayDir, { recursive: true });
  fs.writeFileSync(path.join(todayDir, "story.json"), JSON.stringify(story, null, 1) + "\n");
  process.exit(0);
}

// ---------------------------------------------------------------- publish
const story = readJson(path.join(todayDir, "story.json"));
if (!story) { console.log(`Pas de story préparée pour le ${today}.`); process.exit(0); }
if (DRY) { console.log(`Essai à blanc : story ${story.kind} de ${story.source} prête, rien n'est publié.`); process.exit(0); }

const TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_ID = process.env.IG_USER_ID;
const HOST = process.env.IG_GRAPH_HOST || "https://graph.instagram.com";
const VERSION = process.env.IG_GRAPH_VERSION || "v23.0";
const REPO = process.env.GITHUB_REPOSITORY;
const SHA = process.env.GITHUB_SHA;
if (!TOKEN || !IG_ID) { console.error("::error::Secrets IG_ACCESS_TOKEN et IG_USER_ID requis."); process.exit(1); }

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
    throw new Error(`${method} /${p.split("?")[0]} : ${res.status} ${e.type || ""} ${e.code || ""} ${e.message || ""}`.trim());
  }
  return json;
}
async function waitFinished(id, label, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const s = await graph("GET", id, { fields: "status_code" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`${label} : statut ${s.status_code}`);
    await sleep(4000);
  }
  throw new Error(`${label} : traitement trop long`);
}
const rawUrl = (f) => `https://raw.githubusercontent.com/${REPO}/${SHA}/${f.split("/").map(encodeURIComponent).join("/")}`;

try {
  const file = story.kind === "reel" ? story.video : story.image;
  if (!file || !fs.existsSync(file)) throw new Error(`média introuvable : ${file}`);
  const params = { media_type: "STORIES", ...(story.kind === "reel" ? { video_url: rawUrl(file) } : { image_url: rawUrl(file) }) };
  const container = await graph("POST", `${IG_ID}/media`, params);
  await waitFinished(container.id, "story");
  const pub = await graph("POST", `${IG_ID}/media_publish`, { creation_id: container.id });
  fs.writeFileSync(path.join(todayDir, "published.json"), JSON.stringify({ media_id: pub.id, source: story.source, at: new Date().toISOString() }, null, 1) + "\n");
  console.log(`${today} : story publiée (${story.kind} de ${story.source})`);
} catch (e) {
  console.error(`::error::story du ${today} : ÉCHEC, ${e.message}`);
  process.exit(1);
}

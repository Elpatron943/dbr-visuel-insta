// Programme la REPUBLICATION à l'identique d'un carrousel ou d'un réel déjà publié sur Instagram (décision du fondateur du 24 oct. 2026).
// Rien n'est publié par ce script : il crée seulement instagram/<dossier>-repub-<date>/post.json, que l'action « Publier les carrousels et
// réels Instagram validés » (scripts/publish-instagram.mjs) publie à l'heure prévue. Les fichiers (vidéo, couverture, images) ne sont pas copiés :
// post.json porte "republication_of": "<dossier d'origine>" et le publieur lit les médias dans ce dossier.
//
// Règles (modifiables par variables d'environnement) :
// - source : dossier avec published.json vieux d'au moins MIN_AGE_DAYS (28), jamais lui-même une republication, sans "no_republish": true ;
// - une même source ne repasse pas avant REPEAT_DAYS (90) ;
// - créneaux : SLOT_DAYS (jeudi et dimanche) à SLOT_TIME (20:15, heure de Paris), au moins LEAD_HOURS (48) après le passage du script,
//   donc annulable : mettre "approved": false dans le post.json, supprimer le dossier, ou créer le fichier republication/PAUSE ;
// - au plus MAX_PER_WEEK (2) republications par semaine, un seul créneau pris à la fois ;
// - choix : d'abord le contenu le plus vu (stats/instagram-latest.json, par lien du post), à défaut le plus ancien.
// Dépôt public : aucun secret, aucun nom, uniquement des champs destinés à être publiés.
import fs from "node:fs";
import path from "node:path";

const ROOT = "instagram";
const PAUSE = path.join("republication", "PAUSE");
const NOW = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();
const DRY = process.env.DRY_RUN === "1";
const num = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== "" ? Number(v) : d);
const MIN_AGE_DAYS = num(process.env.MIN_AGE_DAYS, 28);
const REPEAT_DAYS = num(process.env.REPEAT_DAYS, 90);
const LEAD_HOURS = num(process.env.LEAD_HOURS, 48);
const MAX_PER_WEEK = num(process.env.MAX_PER_WEEK, 2);
const SLOT_DAYS = String(process.env.SLOT_DAYS || "4,0").split(",").map((x) => Number(x.trim())); // 0 = dimanche … 6 = samedi
const [SLOT_H, SLOT_M] = String(process.env.SLOT_TIME || "20:15").split(":").map(Number);
const DAY = 864e5;

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const iso = (t) => new Date(t).toISOString();

if (fs.existsSync(PAUSE)) { console.log("republication/PAUSE présent : aucune republication programmée."); process.exit(0); }

// --- heure de Paris ---
const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
function paris(t) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute };
}
function parisToUtc(y, m, d, h, min) {
  for (const off of [1, 2]) { // heure d'hiver (UTC+1) ou d'été (UTC+2)
    const t = Date.UTC(y, m - 1, d, h - off, min);
    const q = paris(t);
    if (q.y === y && q.m === m && q.d === d && q.h === h && q.min === min) return t;
  }
  throw new Error(`heure de Paris introuvable : ${y}-${m}-${d} ${h}:${min}`);
}
const weekStart = (t) => { const q = paris(t); const day = Date.UTC(q.y, q.m - 1, q.d); return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY; };

// --- dossiers ---
const dirs = fs.existsSync(ROOT) ? fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, "post.json"))) : [];
const originals = [];
const repubs = [];
for (const slug of dirs) {
  const m = readJson(path.join(ROOT, slug, "post.json"), {});
  const dir = path.join(ROOT, slug);
  if (m.republication_of) {
    repubs.push({ slug, source: String(m.republication_of), at: Date.parse(m.publish_at), published: fs.existsSync(path.join(dir, "published.json")), skipped: fs.existsSync(path.join(dir, "skipped.json")), approved: m.approved === true });
    continue;
  }
  const pub = readJson(path.join(dir, "published.json"));
  if (!pub || fs.existsSync(path.join(dir, "skipped.json")) || m.no_republish === true) continue;
  const at = Date.parse(pub.at);
  if (!Number.isFinite(at)) continue;
  const isReel = m.type === "reel";
  if (isReel && m.controle_qualite !== "ok") continue; // réel sans contrôle qualité passé (règle du 30 oct. 2026) : jamais republié
  const files = isReel ? [m.video, ...(m.cover ? [m.cover] : [])] : (m.images || []);
  if (!files.length || files.some((f) => !f || !fs.existsSync(path.join(dir, f)))) continue; // médias absents : on ne peut pas republier
  originals.push({ slug, m, pub, at, isReel });
}

// --- créneau ---
const live = repubs.filter((r) => !r.skipped && (r.published || r.approved) && Number.isFinite(r.at));
const takenSlots = new Set(live.map((r) => r.at));
const perWeek = new Map();
for (const r of live) perWeek.set(weekStart(r.at), (perWeek.get(weekStart(r.at)) || 0) + 1);
const today = paris(NOW);
let slot = null;
for (let i = 0; i <= 35 && !slot; i++) {
  const day = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
  if (!SLOT_DAYS.includes(day.getUTCDay())) continue;
  const t = parisToUtc(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), SLOT_H, SLOT_M);
  if (t < NOW + LEAD_HOURS * 3600e3) continue; // trop proche : plus de temps pour annuler
  if (takenSlots.has(t)) { slot = "pris"; break; } // le prochain créneau est déjà programmé : rien à faire
  if ((perWeek.get(weekStart(t)) || 0) >= MAX_PER_WEEK) continue;
  slot = t;
}
if (slot === "pris") { console.log("Le prochain créneau de republication est déjà programmé."); process.exit(0); }
if (!slot) { console.log("Aucun créneau libre dans les 35 prochains jours."); process.exit(0); }

// --- source ---
const stats = readJson(path.join("stats", "instagram-latest.json"), { media: [] });
const viewsByLink = new Map((stats.media || []).filter((x) => x.permalink).map((x) => [x.permalink, Number(x.views) || 0]));
const recentlyUsed = new Set(live.filter((r) => r.at >= NOW - REPEAT_DAYS * DAY).map((r) => r.source));
const eligible = originals
  .filter((o) => NOW - o.at >= MIN_AGE_DAYS * DAY && !recentlyUsed.has(o.slug))
  .map((o) => ({ ...o, views: viewsByLink.has(o.pub.permalink) ? viewsByLink.get(o.pub.permalink) : -1 }))
  .sort((a, b) => b.views - a.views || a.at - b.at);
if (!eligible.length) {
  const next = originals.filter((o) => !recentlyUsed.has(o.slug)).map((o) => o.at + MIN_AGE_DAYS * DAY).sort((a, b) => a - b)[0];
  console.log(`Stock vide : aucun contenu publié depuis ${MIN_AGE_DAYS} jours et libre.${next ? ` Prochain éligible le ${iso(next).slice(0, 10)}.` : ""}`);
  process.exit(0);
}
const src = eligible[0];
const q = paris(slot);
const name = `${src.slug}-repub-${q.y}-${String(q.m).padStart(2, "0")}-${String(q.d).padStart(2, "0")}`;
const m = src.m;
const post = {
  ...(src.isReel ? { type: "reel", video: m.video, ...(m.cover ? { cover: m.cover } : {}) } : { images: m.images }),
  caption: m.caption,
  ...(m.keyword ? { keyword: m.keyword, guide_title: m.guide_title, guide_url: m.guide_url } : {}),
  publish_at: iso(slot),
  approved: true,
  approval_id: null,
  republication_of: src.slug,
  note: `Republication à l'identique de ${src.slug} (publié le ${iso(src.at).slice(0, 10)}), décision du fondateur du 24/10/2026. Pour annuler : "approved": false, ou supprimer ce dossier, ou créer republication/PAUSE.`,
};
console.log(`Republication : ${src.slug} (${src.isReel ? "réel" : "carrousel"}, publié le ${iso(src.at).slice(0, 10)}, vues ${src.views < 0 ? "inconnues" : src.views}) → ${iso(slot)} (${String(q.h).padStart(2, "0")}:${String(q.min).padStart(2, "0")} à Paris), dossier ${name}`);
if (DRY) { console.log("Essai à blanc : rien n'est écrit."); process.exit(0); }
const out = path.join(ROOT, name);
if (fs.existsSync(out)) { console.log("Dossier déjà existant : rien à faire."); process.exit(0); }
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "post.json"), JSON.stringify(post, null, 1) + "\n");

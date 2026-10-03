// Publie sur Instagram les carrousels préparés par Nora, UNIQUEMENT s'ils ont été validés par le fondateur.
// Un carrousel = instagram/<slug>/post.json + 2 à 10 images JPEG dans le même dossier.
// post.json : { "publish_at": "2026-10-14T10:15:00Z", "approved": false, "caption": "…", "images": ["01.jpg", …], "approval_id": "…" }
// Le dépôt est public : ce script ne doit JAMAIS écrire le jeton ni une URL qui le contient dans les journaux.
import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_ID = process.env.IG_USER_ID;
const HOST = process.env.IG_GRAPH_HOST || "https://graph.instagram.com";
const VERSION = process.env.IG_GRAPH_VERSION || "v23.0";
const REPO = process.env.GITHUB_REPOSITORY; // Elpatron943/dbr-visuel-insta
const MAX_LATE_DAYS = 7;

const root = "instagram";
const dirs = fs.existsSync(root) ? fs.readdirSync(root).map((d) => path.join(root, d)).filter((d) => fs.existsSync(path.join(d, "post.json"))) : [];
const now = Date.now();
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
  due.push({ dir, m });
}
if (!due.length) { console.log("Aucun carrousel validé à publier maintenant."); process.exit(0); }
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
async function waitFinished(id, label) {
  for (let i = 0; i < 30; i++) {
    const s = await graph("GET", id, { fields: "status_code" });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`${label} : statut ${s.status_code}`);
    await sleep(4000);
  }
  throw new Error(`${label} : traitement trop long`);
}

let failures = 0;
for (const { dir, m } of due.slice(0, 1)) { // un seul carrousel par passage
  try {
    const images = (m.images || []).filter((f) => /\.jpe?g$/i.test(f));
    if (images.length < 2 || images.length > 10) throw new Error(`il faut 2 à 10 images JPEG (trouvé ${images.length})`);
    for (const f of images) if (!fs.existsSync(path.join(dir, f))) throw new Error(`image manquante : ${f}`);
    const caption = String(m.caption || "");
    if (caption.length > 2200) throw new Error("légende de plus de 2 200 caractères");
    if ((caption.match(/#/g) || []).length > 30) throw new Error("plus de 30 hashtags");
    const sha = process.env.GITHUB_SHA;
    const base = `https://raw.githubusercontent.com/${REPO}/${sha}/${dir}`;

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
    console.error(`::error::${dir} : ÉCHEC — ${e.message}`);
  }
}
process.exit(failures ? 1 : 0);

// Publie sur TikTok les réels DÉJÀ publiés sur Instagram, une fois le contrôle qualité validé par le fondateur.
// Un réel part sur TikTok seulement si son dossier instagram/<dossier>/ a :
//   - "type": "reel" et un published.json (donc approved true et garde-fous Instagram passés) ;
//   - en publication directe seulement : "controle_qualite": "valide_fondateur" dans post.json (en mode brouillon,
//     le fondateur relit le réel dans l'app TikTok et le publie s'il lui plaît) ;
//   - ni tiktok.json (déjà envoyé), ni "no_tiktok": true, ni "republication_of" (une republication Instagram ne repart pas).
// Garde-fous : au plus un réel TikTok par jour (heure de Paris), rien entre 21 h et 7 h, au moins DELAY_HOURS après
// la publication Instagram (le temps de l'arrêter avec "no_tiktok": true), au plus MAX_LATE_DAYS après, réels publiés
// sur Instagram depuis SINCE seulement. Tout arrêter : fichier tiktok/PAUSE.
// Légende : "tiktok_caption" de post.json, sinon celle d'Instagram sans le paragraphe « Commente <MOT> »
// (l'envoi automatique du guide n'existe que sur Instagram).
// Carrousels (31 oct. 2026) : un contenu DBR part sur tous les réseaux, TikTok compris. Un carrousel publié sur Instagram
// part donc aussi, en mode photo (1er nov. 2026 : carrousel natif TikTok, on fait défiler les images ; plus de vidéo
// diaporama), ou en vidéo si le dossier fournit "tiktok_video". TikTok télécharge lui-même les images depuis
// https://daily-business-review.com/tiktok-media/<dossier>/<NN>.jpg (route du site, préfixe vérifié dans le portail
// développeur TikTok). Images nommées 01.jpg à 35.jpg. Mêmes garde-fous que les réels.
// Le jeton TikTok n'est jamais ici : la route /api/tiktok-publish du site le garde et renvoie l'adresse d'envoi.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const API = process.env.TIKTOK_API_URL || "https://daily-business-review.com/api/tiktok-publish";
const SECRET = process.env.TIKTOK_PUBLISH_SECRET;
// Mode brouillon par défaut (30 oct. 2026) : l'app TikTok n'a que video.upload. Le réel arrive dans la boîte de réception
// de l'app TikTok et le fondateur le publie lui-même, en collant la légende écrite dans tiktok.json.
// Passer la variable TIKTOK_MODE à "direct" quand video.publish (Direct Post) sera accordé.
const MODE = process.env.TIKTOK_MODE === "direct" ? "direct" : "inbox";
const DRY_RUN = process.env.DRY_RUN === "true";
const SINCE = Date.parse("2026-10-31T00:00:00Z");
const DELAY_HOURS = 2;
const MAX_LATE_DAYS = 7;
const OPEN_HOUR = 7;
const CLOSE_HOUR = 21;
const FORBIDDEN = /[–—←-⇿➔-➿⬅-⬇☀-➿️]|\p{Extended_Pictographic}/u;

const parisFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false });
function paris(t) {
  const p = Object.fromEntries(parisFmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour % 24 };
}
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function tiktokCaption(m) {
  if (m.tiktok_caption) return String(m.tiktok_caption).trim();
  return String(m.caption || "")
    .split(/\n\s*\n/)
    .filter((para) => !/^\s*commente\b/i.test(para))
    .join("\n\n")
    .trim();
}

if (fs.existsSync("tiktok/PAUSE")) { console.log("tiktok/PAUSE présent : aucune publication TikTok."); process.exit(0); }

const root = "instagram";
const dirs = fs.existsSync(root) ? fs.readdirSync(root).map((d) => path.join(root, d)).filter((d) => fs.existsSync(path.join(d, "post.json"))) : [];
const now = Date.now();
const today = paris(now);
const sentToday = dirs.some((d) => { const t = readJson(path.join(d, "tiktok.json")); return t && paris(t.at).day === today.day; });

const due = [];
for (const dir of dirs) {
  if (fs.existsSync(path.join(dir, "tiktok.json"))) continue;
  const m = readJson(path.join(dir, "post.json"));
  const ig = readJson(path.join(dir, "published.json"));
  if (!m || !ig || m.republication_of || m.no_tiktok === true) continue;
  const isReel = m.type === "reel";
  if (!isReel && !(Array.isArray(m.images) && m.images.length)) continue;
  const at = Date.parse(ig.at);
  if (!Number.isFinite(at) || at < SINCE) continue;
  // En mode brouillon, le fondateur relit le réel dans l'app TikTok avant de le publier : pas de validation préalable.
  if (MODE === "direct" && isReel && m.controle_qualite !== "valide_fondateur") {
    console.log(`::warning::${dir} : contrôle qualité non validé par le fondateur, pas de publication directe sur TikTok`);
    continue;
  }
  if (now - at < DELAY_HOURS * 36e5) continue;
  if (now - at > MAX_LATE_DAYS * 864e5) { console.log(`${dir} : publié sur Instagram il y a plus de ${MAX_LATE_DAYS} jours, ignoré`); continue; }
  const caption = tiktokCaption(m);
  if (!caption || caption.length > 2200 || FORBIDDEN.test(caption)) {
    console.log(`::error::${dir} : légende TikTok vide, trop longue ou avec émoji, flèche ou tiret long`);
    continue;
  }
  const video = path.join(dir, String((isReel ? m.video : m.tiktok_video) || ""));
  const hasVideo = /\.mp4$/i.test(video) && fs.existsSync(video);
  if (isReel && !hasVideo) { console.log(`::error::${dir} : vidéo manquante`); continue; }
  if (!isReel && !hasVideo && !m.images.every((f) => /^[0-9]{2}\.jpe?g$/i.test(f) && fs.existsSync(path.join(dir, f)))) {
    console.log(`::error::${dir} : image du carrousel manquante ou mal nommée (01.jpg à 35.jpg attendus)`);
    continue;
  }
  due.push({ dir, m, at, caption, video: hasVideo ? video : null });
}
due.sort((a, b) => a.at - b.at);

async function call(body) {
  const r = await fetch(API, { method: "POST", headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${body.action} : ${r.status} ${j.error || ""}`.trim());
  return j;
}


if (!SECRET && (DRY_RUN || due.length)) { console.error("::error::Secret TIKTOK_PUBLISH_SECRET requis (environnement GitHub « TikTok »)."); process.exit(1); }

if (DRY_RUN) {
  const c = await call({ action: "check" });
  console.log(`Essai à blanc. Compte TikTok : ${c.account}, droits : ${c.scope}, publication directe : ${c.direct_post ? "oui" : "non"}, confidentialité visée : ${c.privacy_level} (possibles : ${c.privacy_level_options.join(", ") || "aucune"}).`);
  console.log(due.length ? `Serait publié : ${due[0].dir}${due[0].video ? "" : " (carrousel, en mode photo)"}\n--- légende ---\n${due[0].caption}` : "Aucun réel à publier maintenant.");
  process.exit(0);
}
if (!due.length) { console.log("Aucun réel à publier sur TikTok maintenant."); process.exit(0); }
if (today.hour < OPEN_HOUR || today.hour >= CLOSE_HOUR) { console.log(`Il est ${today.hour} h à Paris : pas de publication TikTok avant ${OPEN_HOUR} h ni après ${CLOSE_HOUR} h.`); process.exit(0); }
if (sentToday) { console.log(`Déjà un réel TikTok aujourd'hui : ${due.length} réel(s) attendent demain.`); process.exit(0); }

const { dir, m, caption } = due[0]; // une seule publication par passage

// Carrousel en mode photo : TikTok télécharge les images, rien à pousser d'ici.
async function sendPhotos() {
  const images = m.images.map((f) => `${path.basename(dir)}/${f}`);
  const title = caption.split("\n")[0].trim();
  const init = await call({ action: "init_photo", mode: MODE, images, title, description: caption });
  const record = { mode: init.mode, media: "photo", publish_id: init.publish_id, status: "PROCESSING_DOWNLOAD", post_id: null, approval_id: m.approval_id || null, at: new Date().toISOString() };
  if (init.mode === "inbox") record.caption = caption;
  try {
    const final = init.mode === "inbox" ? ["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"] : ["PUBLISH_COMPLETE"];
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      const s = await call({ action: "status", publish_id: init.publish_id });
      record.status = s.status;
      if (s.publicaly_available_post_id?.length) record.post_id = String(s.publicaly_available_post_id[0]);
      if (s.status === "FAILED") throw new Error(`TikTok a refusé les images : ${s.fail_reason || "raison inconnue"}`);
      if (final.includes(s.status) && (init.mode === "inbox" || record.post_id || i > 10)) break;
    }
  } catch (e) {
    record.error = e.message;
    throw e;
  } finally {
    fs.writeFileSync(path.join(dir, "tiktok.json"), JSON.stringify(record, null, 1));
  }
  console.log(`${dir} : carrousel ${init.mode === "inbox" ? "envoyé en brouillon TikTok" : "publié sur TikTok"} en mode photo (statut ${record.status})`);
}

if (!due[0].video) {
  try { await sendPhotos(); } catch (e) { console.error(`::error::${dir} : ÉCHEC TikTok (photos), ${e.message}`); process.exit(1); }
  process.exit(0);
}

try {
  const video = due[0].video;
  const buf = fs.readFileSync(video);
  let duration;
  try { duration = Math.ceil(Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim())); } catch {}
  const init = await call({ action: "init", mode: MODE, video_size: buf.length, title: caption, duration_sec: duration, cover_ms: m.tiktok_cover_ms });
  // À partir d'ici TikTok a créé la publication : tiktok.json est écrit quoi qu'il arrive, pour ne jamais publier deux fois.
  const record = { mode: init.mode, publish_id: init.publish_id, status: "UPLOADING", post_id: null, approval_id: m.approval_id || null, at: new Date().toISOString() };
  if (init.mode === "inbox") record.caption = caption; // un brouillon TikTok n'a pas de légende : à coller à la publication
  try {
    for (let i = 0; i < init.total_chunk_count; i++) {
      const start = i * init.chunk_size;
      const end = i === init.total_chunk_count - 1 ? buf.length : start + init.chunk_size;
      const put = await fetch(init.upload_url, {
        method: "PUT",
        headers: { "Content-Type": "video/mp4", "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${buf.length}` },
        body: buf.subarray(start, end),
      });
      if (!put.ok) throw new Error(`envoi du morceau ${i + 1}/${init.total_chunk_count} refusé : ${put.status}`);
    }
    const final = init.mode === "inbox" ? ["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"] : ["PUBLISH_COMPLETE"];
    for (let i = 0; i < 60; i++) { // jusqu'à 5 minutes de traitement
      await sleep(5000);
      const s = await call({ action: "status", publish_id: init.publish_id });
      record.status = s.status;
      if (s.publicaly_available_post_id?.length) record.post_id = String(s.publicaly_available_post_id[0]);
      if (s.status === "FAILED") throw new Error(`TikTok a refusé la vidéo : ${s.fail_reason || "raison inconnue"}`);
      if (final.includes(s.status) && (init.mode === "inbox" || record.post_id || i > 10)) break;
    }
  } catch (e) {
    record.error = e.message;
    throw e;
  } finally {
    fs.writeFileSync(path.join(dir, "tiktok.json"), JSON.stringify(record, null, 1));
  }
  console.log(`${dir} : ${init.mode === "inbox" ? "envoyé en brouillon TikTok" : "publié sur TikTok"} (statut ${record.status}${record.post_id ? `, vidéo ${record.post_id}` : ""})`);
} catch (e) {
  console.error(`::error::${dir} : ÉCHEC TikTok, ${e.message}`);
  process.exit(1);
}

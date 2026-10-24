// « Commente le mot » : envoie automatiquement le guide en message privé à chaque personne
// qui commente le mot-clé d'un réel ou d'un carrousel publié (décision du fondateur du 24 oct. 2026).
//
// post.json du contenu : { …, "keyword": "CHAMPION", "guide_title": "Guide complet : construire un Champion",
//                         "guide_url": "https://daily-business-review.com/blog/guide-construire-un-champion" }
// Le contenu doit être publié (published.json avec media_id) depuis moins de 7 jours (fenêtre des réponses privées d'Instagram).
//
// Pour chaque commentaire qui contient le mot (majuscules, minuscules et accents indifférents) :
//   1. une réponse privée (API Instagram, recipient.comment_id), une seule par commentaire et par personne ;
//   2. une courte réponse publique sous le commentaire (« C'est parti en message privé 📩 »).
// Droits du jeton nécessaires : instagram_business_manage_comments et instagram_business_manage_messages.
//
// Le dépôt est public : aucun nom, identifiant de compte ni texte de commentaire n'est écrit dans le dépôt ou les journaux.
// Seules des empreintes (sha256) des identifiants de commentaires et des compteurs sont enregistrés dans engagement/.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_ID = process.env.IG_USER_ID;
const HOST = process.env.IG_GRAPH_HOST || "https://graph.instagram.com";
const VERSION = process.env.IG_GRAPH_VERSION || "v23.0";
const DRY = process.env.DRY_RUN === "1";
const WINDOW_DAYS = 7;
const MAX_SEND_PER_RUN = 60;

const OUT = "engagement";
const HANDLED = path.join(OUT, "handled.json");
const STATS = path.join(OUT, "stats.json");
const STATUS = path.join(OUT, "status.json");
fs.mkdirSync(OUT, { recursive: true });
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const handled = readJson(HANDLED, {});
const stats = readJson(STATS, {});
const hash = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 32);
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const words = (s) => norm(s).split(/[^A-Z0-9]+/).filter(Boolean);

const PUBLIC_REPLIES = [
  "C'est parti en message privé 📩",
  "Envoyé ! Regarde tes messages (ou tes demandes de messages) 📩",
  "Le guide t'attend dans tes messages 📩",
  "C'est dans ta boîte de messages 📩 Bonne lecture !",
];
const dmText = (m) => m.dm_text || [
  `Salut 👋 Comme promis, voici le guide complet${m.guide_title ? ` « ${m.guide_title.replace(/^Guide complet\s*:\s*/i, "")} »` : ""} :`,
  m.guide_url,
  "",
  "Bonne lecture, et dis-moi ce que tu en retiens.",
  "Aryana",
  "",
  "(message automatique envoyé parce que tu as commenté le mot de la vidéo)",
].join("\n");

// 1. Contenus concernés
const root = "instagram";
const now = Date.now();
const targets = [];
for (const d of fs.existsSync(root) ? fs.readdirSync(root) : []) {
  const dir = path.join(root, d);
  const pj = path.join(dir, "post.json"), pub = path.join(dir, "published.json");
  if (!fs.existsSync(pj) || !fs.existsSync(pub)) continue;
  const m = readJson(pj, {}), p = readJson(pub, {});
  if (!m.keyword || !m.guide_url || !p.media_id) continue;
  const at = Date.parse(p.at || m.publish_at);
  if (!Number.isFinite(at) || now - at > WINDOW_DAYS * 864e5) continue;
  targets.push({ slug: d, m, media: p.media_id, key: norm(m.keyword).replace(/[^A-Z0-9]/g, "") });
}
const writeStatus = (o) => {
  // N'écrit que si l'état change (évite un commit toutes les 10 minutes).
  const prev = readJson(STATUS, {}), next = { dry_run: DRY, contenus_suivis: targets.length, ...o };
  const { at, ...rest } = prev;
  if (JSON.stringify(rest) === JSON.stringify(next)) return;
  fs.writeFileSync(STATUS, JSON.stringify({ at: new Date().toISOString(), ...next }, null, 1) + "\n");
};
if (!targets.length) { writeStatus({ dm: "rien à traiter" }); console.log("Aucun contenu publié avec mot-clé dans les 7 derniers jours."); process.exit(0); }
if (!TOKEN || !IG_ID) { console.error("::error::Secrets IG_ACCESS_TOKEN et IG_USER_ID requis."); process.exit(1); }

async function call(method, p, { params = {}, json } = {}) {
  const url = new URL(`${HOST}/${VERSION}/${p}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(json ? { "Content-Type": "application/json" } : {}) },
    body: json ? JSON.stringify(json) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const e = body.error || {};
    const err = new Error(`${method} ${p.split("/").pop()} → ${res.status} ${e.code || ""}/${e.error_subcode || ""} ${e.message || ""}`.trim());
    err.code = e.code; err.sub = e.error_subcode;
    throw err;
  }
  return body;
}
const isPermission = (e) => [10, 190, 200, 3].includes(e.code) && !/window|fen[eê]tre|outside/i.test(e.message);

// 2. Lecture des commentaires et envoi
let sent = 0, replied = 0, failed = 0, blocked = null;
for (const t of targets) {
  const s = (stats[t.slug] ||= { keyword: t.m.keyword, comments_with_keyword: 0, dm_sent: 0, dm_failed: 0 });
  s.keyword = t.m.keyword;
  let comments = [];
  try {
    let next = `${t.media}/comments`, params = { fields: "id,text,timestamp,from,username", limit: "50" };
    for (let page = 0; next && page < 10; page++) {
      const r = await call("GET", next, { params });
      comments.push(...(r.data || []));
      const after = r.paging?.cursors?.after;
      next = r.paging?.next && after ? `${t.media}/comments` : null;
      params = { ...params, after };
    }
  } catch (e) {
    console.log(`::warning::${t.slug} : lecture des commentaires impossible (${e.message})`);
    if (isPermission(e)) { blocked = `lecture des commentaires refusée : ${e.message}`; break; }
    continue;
  }
  for (const c of comments) {
    const from = c.from?.id || c.username || "";
    if (String(c.from?.id) === String(IG_ID)) continue; // nos propres réponses
    if (!words(c.text).includes(t.key)) continue;
    const hc = hash(`c:${c.id}`), hu = hash(`u:${t.slug}:${from}`);
    if (handled[hc] || (from && handled[hu])) continue;
    if (sent >= MAX_SEND_PER_RUN) break;
    s.comments_with_keyword++;
    if (DRY) { console.log(`[essai] ${t.slug} : un commentaire avec ${t.m.keyword} recevrait le guide`); continue; }
    try {
      await call("POST", `${IG_ID}/messages`, { json: { recipient: { comment_id: c.id }, message: { text: dmText(t.m) } } });
      sent++; s.dm_sent++;
      handled[hc] = handled[hu] = new Date().toISOString().slice(0, 10);
    } catch (e) {
      if (isPermission(e)) { blocked = `envoi du message privé refusé : ${e.message}`; s.comments_with_keyword--; break; }
      failed++; s.dm_failed++;
      handled[hc] = new Date().toISOString().slice(0, 10); // hors fenêtre, messages fermés… : on n'insiste pas
      console.log(`::warning::${t.slug} : message privé non envoyé (${e.message})`);
      continue;
    }
    try {
      await call("POST", `${c.id}/replies`, { params: { message: PUBLIC_REPLIES[sent % PUBLIC_REPLIES.length] } });
      replied++;
    } catch (e) { console.log(`::warning::${t.slug} : réponse publique non postée (${e.message})`); }
    await new Promise((r) => setTimeout(r, 1500));
  }
  if (blocked) break;
}

fs.writeFileSync(HANDLED, JSON.stringify(handled, null, 0) + "\n");
fs.writeFileSync(STATS, JSON.stringify(stats, null, 1) + "\n");
writeStatus({ dm: blocked ? `refusé — ${blocked}` : "ok", envoyes_ce_passage: sent, reponses_publiques: replied, echecs: failed });
if (blocked) { console.log(`::error::${blocked}. Le jeton doit avoir les droits instagram_business_manage_comments et instagram_business_manage_messages, et « Autoriser l'accès aux messages » doit être activé dans l'app Instagram.`); process.exit(1); }
console.log(`::notice::Guides envoyés : ${sent}, réponses publiques : ${replied}, échecs : ${failed}${DRY ? " (essai à blanc)" : ""}`);

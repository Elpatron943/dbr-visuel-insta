// « Commente le mot » : envoie automatiquement le guide en message privé aux personnes qui commentent le mot-clé
// d'un réel ET sont abonnées au compte (décisions du fondateur du 24 oct. 2026).
//
// post.json du contenu : { …, "keyword": "CHAMPION", "guide_title": "Guide complet : construire un Champion",
//                         "guide_url": "https://daily-business-review.com/blog/guide-construire-un-champion" }
//
// Étape 1, commentaires (contenus publiés depuis moins de 7 jours, fenêtre des réponses privées d'Instagram) :
//   commentaire contenant le mot (majuscules, minuscules, accents indifférents) → une réponse privée qui demande
//   de s'abonner puis de répondre GUIDE, et une courte réponse publique sous le commentaire.
// Étape 2, messages : quand la personne répond, on vérifie qu'elle est abonnée (is_user_follow_business) :
//   abonnée → envoi du lien du guide ; pas encore abonnée → un rappel (2 au plus), puis on s'arrête.
// Instagram ne permet de vérifier l'abonnement qu'après un message de la personne : d'où la réponse « GUIDE ».
// Droits du jeton : instagram_business_basic, instagram_business_manage_comments, instagram_business_manage_messages.
//
// Le dépôt est public : aucun nom, identifiant de compte ni texte de commentaire ou de message n'est écrit
// dans le dépôt ou les journaux. Seules des empreintes (sha256) et des compteurs sont enregistrés dans engagement/.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const TOKEN = process.env.IG_ACCESS_TOKEN;
const IG_ID = process.env.IG_USER_ID;
const HOST = process.env.IG_GRAPH_HOST || "https://graph.instagram.com";
const VERSION = process.env.IG_GRAPH_VERSION || "v23.0";
const DRY = process.env.DRY_RUN === "1";
const COMMENT_WINDOW_DAYS = 7; // réponse privée possible 7 jours après le commentaire
const POST_WINDOW_DAYS = 45; // contenus suivis : publiés depuis 45 jours au plus
const CONV_WINDOW_DAYS = 10;
const MAX_REMINDERS = 2;
const MAX_SEND_PER_RUN = 80;
const ACCOUNT = process.env.IG_HANDLE || "@aryanadbr";

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
const today = () => new Date().toISOString().slice(0, 10);
const shortTitle = (m) => String(m.guide_title || "").replace(/^Guide complet\s*:\s*/i, "").trim();

// Marqueurs (servent à reconnaître nos propres messages dans une conversation)
const GATE_MARK = "réservé aux abonnés";
const REMIND_MARK = "pas encore parmi les abonnés";
const LINK_MARK = "Comme promis, voici le guide complet";
const gateText = (m) => [
  `Salut 👋 Merci pour ton commentaire ! Le guide complet « ${shortTitle(m)} » est ${GATE_MARK} de ${ACCOUNT}.`,
  "",
  `1. Abonne-toi à ${ACCOUNT}`,
  "2. Réponds GUIDE à ce message",
  "",
  "et je te l'envoie aussitôt.",
  "(message automatique)",
].join("\n");
const remindText = (title) => [
  `Je ne te vois ${REMIND_MARK} 🙂 Abonne-toi à ${ACCOUNT}, puis réponds GUIDE ici et je t'envoie « ${title} ».`,
  "(message automatique)",
].join("\n");
const linkText = (m) => [
  `Merci de nous suivre 🙌 ${LINK_MARK} « ${shortTitle(m)} » :`,
  m.guide_url,
  "",
  "Bonne lecture, et dis-moi ce que tu en retiens.",
  "Aryana",
].join("\n");
const PUBLIC_REPLIES = [
  "Regarde tes messages (ou tes demandes de messages) 📩",
  "Je t'ai écrit en message privé 📩",
  "C'est dans tes messages 📩",
  "Réponse envoyée en message privé 📩",
];

// Contenus avec mot-clé
const root = "instagram";
const now = Date.now();
const all = [];
for (const d of fs.existsSync(root) ? fs.readdirSync(root) : []) {
  const dir = path.join(root, d);
  const pj = path.join(dir, "post.json"), pub = path.join(dir, "published.json");
  if (!fs.existsSync(pj) || !fs.existsSync(pub)) continue;
  const m = readJson(pj, {}), p = readJson(pub, {});
  if (!m.keyword || !m.guide_url || !m.guide_title || !p.media_id) continue;
  const at = Date.parse(p.at || m.publish_at);
  all.push({ slug: d, m, media: p.media_id, at, key: norm(m.keyword).replace(/[^A-Z0-9]/g, "") });
}
const forComments = all.filter((t) => Number.isFinite(t.at) && now - t.at <= POST_WINDOW_DAYS * 864e5);
const forConvs = all.filter((t) => Number.isFinite(t.at) && now - t.at <= (POST_WINDOW_DAYS + CONV_WINDOW_DAYS) * 864e5);
const byTitle = new Map(all.map((t) => [shortTitle(t.m), t]));

const writeStatus = (o) => {
  // N'écrit que si l'état change (évite un commit toutes les 10 minutes).
  const prev = readJson(STATUS, {}), next = { dry_run: DRY, contenus_suivis: forConvs.length, ...o };
  const { at, ...rest } = prev;
  if (JSON.stringify(rest) === JSON.stringify(next)) return;
  fs.writeFileSync(STATUS, JSON.stringify({ at: new Date().toISOString(), ...next }, null, 1) + "\n");
};
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
    err.code = e.code;
    throw err;
  }
  return body;
}
const isPermission = (e) => [10, 190, 200, 3].includes(e.code) && !/window|outside|fen[eê]tre/i.test(e.message);
// Rien à traiter : on vérifie seulement les droits du jeton (lecture des commentaires et des messages, sans rien envoyer).
if (!forConvs.length) {
  const droits = {};
  try {
    const media = await call("GET", `${IG_ID}/media`, { params: { fields: "id", limit: "1" } });
    const id = media.data?.[0]?.id;
    if (id) { await call("GET", `${id}/comments`, { params: { fields: "id", limit: "1" } }); droits.commentaires = "ok"; }
    else droits.commentaires = "aucune publication pour tester";
  } catch (e) { droits.commentaires = `refusé, ${e.message}`; }
  try { await call("GET", `${IG_ID}/conversations`, { params: { platform: "instagram", fields: "id", limit: "1" } }); droits.messages = "ok"; }
  catch (e) { droits.messages = `refusé, ${e.message}`; }
  const ok = droits.commentaires !== undefined && !String(droits.commentaires).startsWith("refusé") && droits.messages === "ok";
  writeStatus({ dm: ok ? "ok" : "refusé, droits incomplets", droits, note: "aucun contenu avec mot-clé : vérification des droits seulement" });
  console.log(`::notice::Droits du jeton, commentaires : ${droits.commentaires} ; messages : ${droits.messages}`);
  process.exit(ok ? 0 : 1);
}
const send = (recipient, text) => call("POST", `${IG_ID}/messages`, { json: { recipient, message: { text } } });
const st = (slug, kw) => (stats[slug] ||= { keyword: kw, commentaires_avec_mot: 0, invitations: 0, guides_envoyes: 0, rappels_non_abonnes: 0, echecs: 0 });

let me = { id: IG_ID, username: "" };
try { me = { ...me, ...(await call("GET", "me", { params: { fields: "user_id,username" } })) }; } catch {}
const ours = (from) => from && (String(from.id) === String(IG_ID) || String(from.id) === String(me.user_id) || (me.username && from.username === me.username));

let sent = 0, blocked = null;
const count = { invitations: 0, guides: 0, rappels: 0, echecs: 0 };

// Étape 1 : commentaires → invitation privée
for (const t of forComments) {
  if (blocked || sent >= MAX_SEND_PER_RUN) break;
  const s = st(t.slug, t.m.keyword); s.keyword = t.m.keyword;
  let comments = [];
  try {
    let params = { fields: "id,text,timestamp,from,username", limit: "50" };
    for (let page = 0; page < 10; page++) {
      const r = await call("GET", `${t.media}/comments`, { params });
      comments.push(...(r.data || []));
      if (!r.paging?.next || !r.paging?.cursors?.after) break;
      params = { ...params, after: r.paging.cursors.after };
    }
  } catch (e) {
    console.log(`::warning::${t.slug} : lecture des commentaires impossible (${e.message})`);
    if (isPermission(e)) blocked = `lecture des commentaires refusée : ${e.message}`;
    continue;
  }
  for (const c of comments) {
    if (ours(c.from)) continue;
    if (c.timestamp && now - Date.parse(c.timestamp) > COMMENT_WINDOW_DAYS * 864e5) continue; // trop ancien pour une réponse privée
    if (!words(c.text).includes(t.key)) continue;
    const who = c.from?.id || c.username || c.id;
    const hc = hash(`c:${c.id}`), hu = hash(`u:${t.slug}:${who}`);
    if (handled[hc] || handled[hu]) continue;
    if (sent >= MAX_SEND_PER_RUN) break;
    if (DRY) { console.log(`[essai] ${t.slug} : un commentaire avec ${t.m.keyword} recevrait l'invitation`); continue; }
    s.commentaires_avec_mot++;
    try {
      await send({ comment_id: c.id }, gateText(t.m));
      sent++; s.invitations++; count.invitations++;
      handled[hc] = handled[hu] = today();
    } catch (e) {
      if (isPermission(e)) { blocked = `envoi du message privé refusé : ${e.message}`; s.commentaires_avec_mot--; break; }
      s.echecs++; count.echecs++; handled[hc] = today();
      console.log(`::warning::${t.slug} : invitation non envoyée (${e.message})`);
      continue;
    }
    try { await call("POST", `${c.id}/replies`, { params: { message: PUBLIC_REPLIES[sent % PUBLIC_REPLIES.length] } }); }
    catch (e) { console.log(`::warning::${t.slug} : réponse publique non postée (${e.message})`); }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

// Étape 2 : réponses en message privé → vérification de l'abonnement → lien ou rappel
if (!blocked && !DRY) {
  let convs = [];
  try {
    let params = { platform: "instagram", fields: "id,updated_time", limit: "50" };
    for (let page = 0; page < 6; page++) {
      const r = await call("GET", `${IG_ID}/conversations`, { params });
      const fresh = (r.data || []).filter((c) => now - Date.parse(c.updated_time) <= CONV_WINDOW_DAYS * 864e5);
      convs.push(...fresh);
      if (fresh.length < (r.data || []).length || !r.paging?.cursors?.after) break;
      params = { ...params, after: r.paging.cursors.after };
    }
  } catch (e) {
    console.log(`::warning::lecture des conversations impossible (${e.message})`);
    if (isPermission(e)) blocked = `lecture des messages refusée : ${e.message}`;
  }
  for (const cv of convs) {
    if (blocked || sent >= MAX_SEND_PER_RUN) break;
    let msgs = [];
    try {
      const r = await call("GET", cv.id, { params: { fields: "messages.limit(20){id,created_time,from,message}" } });
      msgs = (r.messages?.data || []).sort((a, b) => Date.parse(a.created_time) - Date.parse(b.created_time));
    } catch (e) { console.log(`::warning::conversation illisible (${e.message})`); continue; }
    // dernier message à nous qui relève de ce circuit
    let lastIdx = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const txt = msgs[i].message || "";
      if (ours(msgs[i].from) && (txt.includes(GATE_MARK) || txt.includes(REMIND_MARK) || txt.includes(LINK_MARK))) { lastIdx = i; break; }
    }
    if (lastIdx < 0) continue;
    const last = msgs[lastIdx].message || "";
    if (last.includes(LINK_MARK)) continue; // guide déjà envoyé
    const reply = msgs.slice(lastIdx + 1).find((x) => !ours(x.from));
    if (!reply) continue; // la personne n'a pas encore répondu
    const hr = hash(`r:${reply.id}`);
    if (handled[hr]) continue;
    // retrouver le guide : titre entre « » dans notre invitation (ou rappel)
    const gate = [...msgs.slice(0, lastIdx + 1)].reverse().find((x) => ours(x.from) && (x.message || "").includes(GATE_MARK));
    const title = ((gate?.message || last).match(/«\s*(.+?)\s*»/) || [])[1];
    const t = byTitle.get(title);
    if (!t) { handled[hr] = today(); continue; }
    const s = st(t.slug, t.m.keyword);
    const userId = reply.from?.id;
    let follows = false;
    try { follows = (await call("GET", userId, { params: { fields: "is_user_follow_business" } })).is_user_follow_business === true; }
    catch (e) {
      console.log(`::warning::${t.slug} : abonnement non vérifiable (${e.message})`);
      if (isPermission(e)) { blocked = `vérification de l'abonnement refusée : ${e.message}`; break; }
      continue;
    }
    try {
      if (follows) {
        await send({ id: userId }, linkText(t.m)); s.guides_envoyes++; count.guides++;
      } else {
        const reminders = msgs.filter((x) => ours(x.from) && (x.message || "").includes(REMIND_MARK)).length;
        if (reminders >= MAX_REMINDERS) { handled[hr] = today(); continue; }
        await send({ id: userId }, remindText(shortTitle(t.m))); s.rappels_non_abonnes++; count.rappels++;
      }
      sent++; handled[hr] = today();
    } catch (e) {
      if (isPermission(e)) { blocked = `envoi du message privé refusé : ${e.message}`; break; }
      s.echecs++; count.echecs++; handled[hr] = today();
      console.log(`::warning::${t.slug} : message non envoyé (${e.message})`);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

fs.writeFileSync(HANDLED, JSON.stringify(handled) + "\n");
fs.writeFileSync(STATS, JSON.stringify(stats, null, 1) + "\n");
writeStatus({ dm: blocked ? `refusé, ${blocked}` : "ok", ...(count.invitations + count.guides + count.rappels + count.echecs ? { dernier_passage_actif: count } : {}) });
if (blocked) { console.log(`::error::${blocked}. Le jeton doit avoir les droits instagram_business_manage_comments et instagram_business_manage_messages, et « Autoriser l'accès aux messages » doit être activé dans l'app Instagram.`); process.exit(1); }
console.log(`::notice::Invitations : ${count.invitations}, guides envoyés : ${count.guides}, rappels : ${count.rappels}, échecs : ${count.echecs}${DRY ? " (essai à blanc)" : ""}`);

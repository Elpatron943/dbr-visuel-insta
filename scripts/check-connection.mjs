// Vérifie la connexion Instagram sans rien publier : lit le nom du compte et les droits du jeton.
const TOKEN = process.env.IG_ACCESS_TOKEN, IG_ID = process.env.IG_USER_ID;
if (!TOKEN || !IG_ID) { console.error(`::error::Secrets manquants : ${!TOKEN ? "IG_ACCESS_TOKEN " : ""}${!IG_ID ? "IG_USER_ID" : ""}`); process.exit(1); }
const get = async (p, fields) => {
  const u = new URL(`https://graph.instagram.com/v23.0/${p}`);
  u.searchParams.set("fields", fields); u.searchParams.set("access_token", TOKEN);
  const r = await fetch(u); const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${p} → ${r.status} ${(j.error && j.error.message) || ""}`);
  return j;
};
try {
  const me = await get("me", "user_id,username,account_type");
  const ok = String(me.user_id) === String(IG_ID) || String(me.id) === String(IG_ID);
  const limit = await get(`${IG_ID}/content_publishing_limit`, "quota_usage,config").catch((e) => ({ error: e.message }));
  console.log(`::notice::Connecté à @${me.username} (${me.account_type || "type inconnu"}). IG_USER_ID ${ok ? "correct" : "DIFFÉRENT de l'identifiant du jeton (" + (me.user_id || me.id) + ")"}. Publication : ${limit.error ? "droit non vérifié — " + limit.error : "autorisée, " + (limit.data?.[0]?.quota_usage ?? 0) + " publication(s) sur 24 h"}`);
  if (!ok) process.exit(1);
} catch (e) { console.error(`::error::Connexion Instagram refusée : ${e.message}`); process.exit(1); }

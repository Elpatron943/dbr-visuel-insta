// Relevé des statistiques AGRÉGÉES du compte Instagram (aucune donnée personnelle : pas de commentaires, pas de noms).
// Écrit stats/instagram-latest.json et stats/instagram-AAAA-MM-JJ.json. Dépôt public : jamais de jeton dans les sorties.
import fs from "node:fs";

const TOKEN = process.env.IG_ACCESS_TOKEN, IG_ID = process.env.IG_USER_ID;
if (!TOKEN || !IG_ID) { console.error("::error::Secrets IG_ACCESS_TOKEN et IG_USER_ID requis."); process.exit(1); }
const BASE = "https://graph.instagram.com/v23.0";

async function get(path, params = {}) {
  const u = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("access_token", TOKEN);
  const r = await fetch(u);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`${path} → ${r.status} ${(j.error && j.error.message) || ""}`.trim());
  return j;
}

const out = { at: new Date().toISOString(), account: {}, last_7_days: {}, media: [], errors: [] };

try {
  const me = await get("me", { fields: "username,followers_count,follows_count,media_count" });
  out.account = { username: me.username, followers: me.followers_count ?? null, following: me.follows_count ?? null, media_count: me.media_count ?? null };
} catch (e) { out.errors.push(`compte : ${e.message}`); }

const until = Math.floor(Date.now() / 1000), since = until - 7 * 86400;
for (const metric of ["reach", "views", "accounts_engaged", "total_interactions", "follows_and_unfollows"]) {
  try {
    const r = await get(`${IG_ID}/insights`, { metric, period: "day", metric_type: "total_value", since: String(since), until: String(until) });
    const d = r.data?.[0];
    out.last_7_days[metric] = d?.total_value?.value ?? d?.total_value?.breakdowns ?? null;
  } catch (e) { out.errors.push(`${metric} : ${e.message}`); }
}

try {
  const media = await get(`${IG_ID}/media`, { fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit: "25" });
  for (const m of media.data || []) {
    const item = {
      permalink: m.permalink, type: m.media_product_type || m.media_type, at: m.timestamp,
      first_line: String(m.caption || "").split("\n")[0].slice(0, 120),
      likes: m.like_count ?? null, comments: m.comments_count ?? null,
    };
    try {
      const ins = await get(`${m.id}/insights`, { metric: "reach,views,saved,shares,total_interactions" });
      for (const d of ins.data || []) item[d.name] = d.values?.[0]?.value ?? d.total_value?.value ?? null;
    } catch (e) { item.insights_error = e.message; }
    out.media.push(item);
  }
} catch (e) { out.errors.push(`publications : ${e.message}`); }

fs.mkdirSync("stats", { recursive: true });
const day = out.at.slice(0, 10);
fs.writeFileSync("stats/instagram-latest.json", JSON.stringify(out, null, 1));
fs.writeFileSync(`stats/instagram-${day}.json`, JSON.stringify(out, null, 1));
console.log(`Relevé Instagram : ${out.account.followers ?? "?"} abonnés, ${out.media.length} publications, ${out.errors.length} erreur(s).`);
if (out.errors.length) for (const e of out.errors) console.log(`::warning::${e}`);

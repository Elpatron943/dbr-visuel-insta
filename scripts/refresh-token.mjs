// Prolonge le jeton Instagram de longue durée (valable 60 jours) avant son expiration.
// N'affiche jamais le jeton. Si Instagram renvoie un jeton différent, il faut le remplacer dans les secrets.
const TOKEN = process.env.IG_ACCESS_TOKEN;
if (!TOKEN) { console.log("Pas de jeton configuré : rien à prolonger."); process.exit(0); }
const url = new URL("https://graph.instagram.com/refresh_access_token");
url.searchParams.set("grant_type", "ig_refresh_token");
url.searchParams.set("access_token", TOKEN);
const res = await fetch(url);
const json = await res.json().catch(() => ({}));
if (!res.ok || json.error) { console.error(`::error::Prolongation refusée : ${(json.error && json.error.message) || res.status}. Régénère le jeton dans le tableau de bord Meta et remplace le secret IG_ACCESS_TOKEN.`); process.exit(1); }
const days = Math.round((json.expires_in || 0) / 86400);
if (json.access_token && json.access_token !== TOKEN) { console.error(`::error::Instagram a émis un nouveau jeton (valable ${days} jours) : régénère-le dans le tableau de bord Meta et remplace le secret IG_ACCESS_TOKEN.`); process.exit(1); }
console.log(`Jeton prolongé : encore ${days} jours.`);

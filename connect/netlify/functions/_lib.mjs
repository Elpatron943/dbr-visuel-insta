// Outils partagés : session chiffrée (AES-GCM, clé dérivée de IG_APP_SECRET) et appels à l'API Instagram.
import crypto from "node:crypto";

export const IG_APP_ID = "976438894892241";
export const GRAPH = "https://graph.instagram.com/v23.0";
export const SCOPES = "instagram_business_basic,instagram_business_manage_comments,instagram_business_manage_messages";
export const COOKIE = "dbr_session";

const key = () => {
  const s = Netlify.env.get("IG_APP_SECRET");
  if (!s) throw new Error("IG_APP_SECRET manquant dans les variables d'environnement Netlify");
  return crypto.createHash("sha256").update("dbr-connect:" + s).digest();
};
export const seal = (obj) => {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64url");
};
export const unseal = (s) => {
  try {
    const b = Buffer.from(s, "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"));
  } catch { return null; }
};
export const session = (context) => {
  const raw = context.cookies.get(COOKIE);
  const s = raw ? unseal(raw) : null;
  return s && s.exp > Date.now() ? s : null;
};
export const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
export const needLogin = () => json({ error: "non connecté" }, 401);

export async function ig(path, token, { method = "GET", params = {}, body } = {}) {
  const u = new URL(path.startsWith("http") ? path : `${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((j.error && j.error.message) || `Erreur Instagram ${r.status}`);
  return j;
}

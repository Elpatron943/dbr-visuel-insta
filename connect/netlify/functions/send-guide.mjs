// Envoie le guide en réponse privée à l'auteur d'un commentaire (une seule fois), puis répond publiquement.
import { session, needLogin, json, ig } from "./_lib.mjs";
export default async (req, context) => {
  const s = session(context); if (!s) return needLogin();
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);
  const { comment_id, guide_title, guide_url } = await req.json().catch(() => ({}));
  if (!/^\d+$/.test(comment_id || "") || !/^https:\/\//.test(guide_url || "")) return json({ error: "paramètres invalides" }, 400);
  const title = String(guide_title || "").replace(/^Guide complet\s*:\s*/i, "");
  const text = [
    `Salut 👋 Merci pour ton commentaire ! Le guide complet « ${title} » est réservé aux abonnés de @${s.username}.`,
    "", `1. Abonne-toi à @${s.username}`, "2. Réponds GUIDE à ce message", "", "et je te l'envoie aussitôt.", "(message automatique)",
  ].join("\n");
  try {
    await ig(`${s.uid}/messages`, s.token, { method: "POST", body: { recipient: { comment_id }, message: { text } } });
    let publicReply = true;
    try { await ig(`${comment_id}/replies`, s.token, { method: "POST", params: { message: "Regarde tes messages (ou tes demandes de messages) 📩" } }); } catch { publicReply = false; }
    return json({ ok: true, publicReply });
  } catch (e) { return json({ error: e.message }, 502); }
};
export const config = { path: "/api/send-guide" };

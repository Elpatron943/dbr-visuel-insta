// Messages privés : liste des conversations récentes, vérification de l'abonnement et envoi du lien du guide.
import { session, needLogin, json, ig } from "./_lib.mjs";
export default async (req, context) => {
  const s = session(context); if (!s) return needLogin();
  try {
    if (req.method === "POST") {
      const { user_id, guide_title, guide_url } = await req.json().catch(() => ({}));
      if (!/^\d+$/.test(user_id || "") || !/^https:\/\//.test(guide_url || "")) return json({ error: "paramètres invalides" }, 400);
      const f = await ig(user_id, s.token, { params: { fields: "is_user_follow_business,username" } });
      if (!f.is_user_follow_business) {
        await ig(`${s.uid}/messages`, s.token, { method: "POST", body: { recipient: { id: user_id }, message: { text: `Je ne te vois pas encore parmi les abonnés 🙂 Abonne-toi à @${s.username}, puis réponds GUIDE ici.\n(message automatique)` } } });
        return json({ ok: true, follows: false });
      }
      const title = String(guide_title || "").replace(/^Guide complet\s*:\s*/i, "");
      await ig(`${s.uid}/messages`, s.token, { method: "POST", body: { recipient: { id: user_id }, message: { text: `Merci de nous suivre 🙌 Comme promis, voici le guide complet « ${title} » :\n${guide_url}\n\nBonne lecture !` } } });
      return json({ ok: true, follows: true });
    }
    const list = await ig(`${s.uid}/conversations`, s.token, { params: { platform: "instagram", fields: "id,updated_time,participants,messages.limit(3){id,message,from,created_time}", limit: "15" } });
    const convs = (list.data || []).map((c) => {
      const other = (c.participants?.data || []).find((p) => String(p.id) !== s.uid && p.username !== s.username) || {};
      return { id: c.id, updated_time: c.updated_time, user_id: other.id, username: other.username, messages: (c.messages?.data || []).map((m) => ({ text: m.message, mine: String(m.from?.id) === s.uid || m.from?.username === s.username, at: m.created_time })) };
    });
    return json({ conversations: convs });
  } catch (e) { return json({ error: e.message }, 502); }
};
export const config = { path: "/api/conversations" };

import { session, needLogin, json, ig } from "./_lib.mjs";
export default async (req, context) => {
  const s = session(context); if (!s) return needLogin();
  const media = new URL(req.url).searchParams.get("media");
  if (!/^\d+$/.test(media || "")) return json({ error: "publication inconnue" }, 400);
  try {
    const r = await ig(`${media}/comments`, s.token, { params: { fields: "id,text,timestamp,username,from,replies{id,text,username,timestamp}", limit: "50" } });
    return json({ comments: r.data || [] });
  } catch (e) { return json({ error: e.message }, 502); }
};
export const config = { path: "/api/comments" };

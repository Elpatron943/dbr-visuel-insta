import { session, needLogin, json, ig } from "./_lib.mjs";
export default async (req, context) => {
  const s = session(context); if (!s) return needLogin();
  try {
    const profile = await ig("me", s.token, { params: { fields: "user_id,username,name,profile_picture_url,followers_count,follows_count,media_count,account_type" } });
    const media = await ig("me/media", s.token, { params: { fields: "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,comments_count,like_count", limit: "12" } });
    return json({ profile, media: media.data || [] });
  } catch (e) { return json({ error: e.message }, 502); }
};
export const config = { path: "/api/me" };

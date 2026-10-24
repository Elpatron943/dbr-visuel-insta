// Règles « Commente le mot » : lues dans le dépôt public des contenus (post.json de chaque réel publié).
import { session, needLogin, json } from "./_lib.mjs";
const REPO = "Elpatron943/dbr-visuel-insta";
export default async (req, context) => {
  const s = session(context); if (!s) return needLogin();
  try {
    const tree = await (await fetch(`https://api.github.com/repos/${REPO}/git/trees/main?recursive=1`, { headers: { "User-Agent": "dbr-connect" } })).json();
    const dirs = [...new Set((tree.tree || []).filter((f) => /^instagram\/[^/]+\/published\.json$/.test(f.path)).map((f) => f.path.split("/")[1]))].slice(-30);
    const raw = (p) => fetch(`https://raw.githubusercontent.com/${REPO}/main/${p}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const rules = [];
    for (const d of dirs) {
      const [post, pub] = await Promise.all([raw(`instagram/${d}/post.json`), raw(`instagram/${d}/published.json`)]);
      if (post && pub && post.keyword) rules.push({ media_id: pub.media_id, keyword: post.keyword, guide_title: post.guide_title, guide_url: post.guide_url });
    }
    return json({ rules });
  } catch (e) { return json({ rules: [], error: e.message }); }
};
export const config = { path: "/api/rules" };

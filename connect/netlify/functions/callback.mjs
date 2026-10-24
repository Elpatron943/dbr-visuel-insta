import { IG_APP_ID, COOKIE, seal, ig } from "./_lib.mjs";

const back = (req, msg) => Response.redirect(new URL(`/?erreur=${encodeURIComponent(msg)}`, req.url).toString(), 302);

export default async (req, context) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (url.searchParams.get("error")) return back(req, "Connexion annulée");
  if (!code || url.searchParams.get("state") !== context.cookies.get("dbr_state")) return back(req, "Session expirée, recommencez");
  context.cookies.delete("dbr_state");
  try {
    const form = new URLSearchParams({
      client_id: IG_APP_ID,
      client_secret: Netlify.env.get("IG_APP_SECRET"),
      grant_type: "authorization_code",
      redirect_uri: new URL("/api/callback", req.url).toString(),
      code: code.replace(/#_$/, ""),
    });
    const r = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
    const short = await r.json();
    if (!r.ok || !short.access_token) throw new Error(short.error_message || "échange du code refusé");
    // jeton longue durée (60 jours)
    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.searchParams.set("grant_type", "ig_exchange_token");
    longUrl.searchParams.set("client_secret", Netlify.env.get("IG_APP_SECRET"));
    longUrl.searchParams.set("access_token", short.access_token);
    const lr = await fetch(longUrl);
    const long = await lr.json();
    const token = long.access_token || short.access_token;
    const me = await ig("me", token, { params: { fields: "user_id,username" } });
    const exp = Date.now() + 7 * 864e5;
    context.cookies.set({ name: COOKIE, value: seal({ token, uid: String(me.user_id || me.id), username: me.username, exp }), httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 7 * 86400 });
    return Response.redirect(new URL("/app.html", req.url).toString(), 302);
  } catch (e) {
    return back(req, e.message);
  }
};
export const config = { path: "/api/callback" };

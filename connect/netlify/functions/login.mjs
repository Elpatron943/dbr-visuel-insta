import crypto from "node:crypto";
import { IG_APP_ID, SCOPES } from "./_lib.mjs";

export default async (req, context) => {
  const state = crypto.randomBytes(16).toString("hex");
  context.cookies.set({ name: "dbr_state", value: state, httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 600 });
  const redirect = new URL("/api/callback", req.url).toString();
  const u = new URL("https://www.instagram.com/oauth/authorize");
  u.searchParams.set("client_id", IG_APP_ID);
  u.searchParams.set("redirect_uri", redirect);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", state);
  u.searchParams.set("enable_fb_login", "0");
  u.searchParams.set("force_authentication", "1");
  return Response.redirect(u.toString(), 302);
};
export const config = { path: "/api/login" };

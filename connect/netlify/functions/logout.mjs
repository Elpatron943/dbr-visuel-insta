import { COOKIE } from "./_lib.mjs";
export default async (req, context) => {
  context.cookies.delete({ name: COOKIE, path: "/" });
  return Response.redirect(new URL("/", req.url).toString(), 302);
};
export const config = { path: "/api/logout" };

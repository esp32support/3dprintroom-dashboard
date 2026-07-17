// Gates the ENTIRE dashboard behind a login - runs before every request in
// this Pages project, static assets included, not just /api/* routes. Any
// path not explicitly public gets redirected to the login page unless a
// valid signed session cookie is present.
import { verifySessionCookie } from "./_lib/session.js";

const PUBLIC_PATHS = new Set(["/login.html", "/api/login"]);

export async function onRequest(context) {
    const { request, next, env } = context;
    const url = new URL(request.url);

    if (PUBLIC_PATHS.has(url.pathname)) {
        return next();
    }

    const cookie = request.headers.get("Cookie");
    const authed = await verifySessionCookie(cookie, env.ADMIN_USERNAME, env.SESSION_SECRET);

    if (!authed) {
        return Response.redirect(`${url.origin}/login.html`, 302);
    }

    return next();
}

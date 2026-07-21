// Gates the ENTIRE dashboard behind a login - runs before every request in
// this Pages project, static assets included, not just /api/* routes. Any
// path not explicitly public gets redirected to the login page unless a
// valid signed session cookie is present.
import { verifySessionCookie } from "./_lib/session.js";

// Cloudflare Pages canonicalises "/login.html" requests to "/login" (clean
// URLs) - both forms need to be allowed, or the redirect target gets
// bounced right back through the middleware in an infinite loop: redirect
// to /login.html -> Cloudflare canonicalises to /login -> middleware sees
// /login (not allowlisted) -> redirects to /login.html again -> ...
//
// /api/gcode-sync, /api/device-filament and /api/printer-watch-state are
// meant to be called by scripts/devices with no browser session cookie -
// each enforces its own X-Sync-Secret check internally, so they're
// allowlisted here purely to let the request reach that check at all, not
// to skip authentication entirely. /api/printer-task is dual-use (the
// dashboard's own UI calls it with a session cookie, the print-watch
// script calls it with X-Sync-Secret) - also allowlisted here since it
// checks auth itself either way, for the same reason.
const PUBLIC_PATHS = new Set([
    "/login", "/login.html", "/api/login",
    "/api/gcode-sync", "/api/device-filament",
    "/api/printer-watch-state", "/api/printer-task",
]);

export async function onRequest(context) {
    const { request, next, env } = context;
    const url = new URL(request.url);

    if (PUBLIC_PATHS.has(url.pathname)) {
        return next();
    }

    const cookie = request.headers.get("Cookie");
    const authed = await verifySessionCookie(cookie, env.ADMIN_USERNAME, env.SESSION_SECRET);

    if (!authed) {
        // Redirect to the canonical clean-URL form directly, rather than
        // to /login.html, to avoid relying on Cloudflare's redirect chain
        // (harmless now that both forms are allowlisted, but one less hop).
        return Response.redirect(`${url.origin}/login`, 302);
    }

    return next();
}


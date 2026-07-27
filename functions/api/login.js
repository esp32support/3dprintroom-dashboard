// POST /api/login
// Validates username/password against ADMIN_USERNAME/ADMIN_PASSWORD
// (Cloudflare Pages secrets - never in source) and, on success, sets a
// signed session cookie. This path is explicitly listed as public in
// _middleware.js so it's reachable without already being logged in.
import { createSessionCookie, timingSafeEqual } from "../_lib/session.js";

function jsonResponse(obj, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json", ...extraHeaders },
    });
}

// Security audit finding: no limit on login attempts at all, meaning
// unlimited password-guessing. Reuses the FILAMENT_KV binding already
// present in this project rather than provisioning a new namespace just
// for this - keyed per-IP so one abusive client can't lock out anyone
// else, with a short window (KV's own expirationTtl) so a legitimate
// user who mistypes their password a few times isn't locked out for long.
const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 15 * 60;

export async function onRequestPost(context) {
    const { request, env } = context;

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const attemptsKey = `login-attempts:${ip}`;

    if (env.FILAMENT_KV) {
        const raw = await env.FILAMENT_KV.get(attemptsKey);
        const attempts = raw ? Number(raw) : 0;

        if (attempts >= MAX_ATTEMPTS) {
            return jsonResponse({ error: "too many attempts - try again later" }, 429);
        }
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "invalid JSON body" }, 400);
    }

    const { username, password, rememberMe } = body;

    // Security audit finding: !== on credentials is a timing side-channel
    // (leaks how many leading characters matched). timingSafeEqual runs
    // in constant time regardless of where a mismatch is.
    if (!username || !password ||
        !timingSafeEqual(username, env.ADMIN_USERNAME) ||
        !timingSafeEqual(password, env.ADMIN_PASSWORD)) {
        if (env.FILAMENT_KV) {
            const raw = await env.FILAMENT_KV.get(attemptsKey);
            const attempts = raw ? Number(raw) : 0;
            await env.FILAMENT_KV.put(attemptsKey, String(attempts + 1), { expirationTtl: WINDOW_SECONDS });
        }

        return jsonResponse({ error: "invalid username or password" }, 401);
    }

    if (env.FILAMENT_KV) {
        await env.FILAMENT_KV.delete(attemptsKey);
    }

    const cookie = await createSessionCookie(env.ADMIN_USERNAME, env.SESSION_SECRET, !!rememberMe);

    return jsonResponse({ ok: true }, 200, { "Set-Cookie": cookie });
}

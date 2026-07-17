// POST /api/login
// Validates username/password against ADMIN_USERNAME/ADMIN_PASSWORD
// (Cloudflare Pages secrets - never in source) and, on success, sets a
// signed session cookie. This path is explicitly listed as public in
// _middleware.js so it's reachable without already being logged in.
import { createSessionCookie } from "../_lib/session.js";

function jsonResponse(obj, status = 200, extraHeaders = {}) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { "content-type": "application/json", ...extraHeaders },
    });
}

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: "invalid JSON body" }, 400);
    }

    const { username, password, rememberMe } = body;

    if (!username || !password || username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
        return jsonResponse({ error: "invalid username or password" }, 401);
    }

    const cookie = await createSessionCookie(env.ADMIN_USERNAME, env.SESSION_SECRET, !!rememberMe);

    return jsonResponse({ ok: true }, 200, { "Set-Cookie": cookie });
}

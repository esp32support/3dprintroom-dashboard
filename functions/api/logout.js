// POST /api/logout - clears the session cookie.
import { clearSessionCookie } from "../_lib/session.js";

export async function onRequestPost() {
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
            "content-type": "application/json",
            "Set-Cookie": clearSessionCookie(),
        },
    });
}

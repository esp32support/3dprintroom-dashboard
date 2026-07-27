// Shared session-cookie helpers: a stateless, self-verifying signed token
// (HMAC-SHA256) rather than a server-side session store - avoids needing a
// KV/D1 namespace just to remember who's logged in. The cookie carries its
// own expiry and a signature over (username + expiry), so verifying it is
// just recomputing the HMAC - no lookup required.

// Security audit finding: comparing secrets with === leaks timing
// information proportional to how many leading characters match - a
// textbook side-channel, even though exploiting it over real network
// jitter is hard in practice. XORs every byte and accumulates the result,
// so the loop always runs the full length regardless of where (or
// whether) a mismatch occurs. Length is checked first via a cheap
// bitwise trick that avoids returning early on the actual byte content -
// a length mismatch alone doesn't leak anything useful about the secret.
export function timingSafeEqual(a, b) {
    if (a.length !== b.length)
        return false;

    let result = 0;
    for (let i = 0; i < a.length; i++)
        result |= a.charCodeAt(i) ^ b.charCodeAt(i);

    return result === 0;
}

async function hmacHex(message, secret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw", enc.encode(secret),
        { name: "HMAC", hash: "SHA-256" },
        false, ["sign"]
    );
    const sigBuffer = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return [...new Uint8Array(sigBuffer)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function createSessionCookie(username, secret, rememberMe) {
    // "Remember me" checked -> persists across browser restarts (90 days).
    // Unchecked -> a much shorter-lived cookie instead of a true
    // browser-session cookie, since Cloudflare's edge can't distinguish
    // "browser closed" from "tab still open" anyway.
    const maxAgeSeconds = rememberMe ? 60 * 60 * 24 * 90 : 60 * 60 * 12;
    const expiry = Date.now() + maxAgeSeconds * 1000;
    const signature = await hmacHex(`${username}:${expiry}`, secret);
    const value = encodeURIComponent(`${expiry}.${signature}`);

    return `session=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie() {
    return "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
}

export async function verifySessionCookie(cookieHeader, username, secret) {
    if (!cookieHeader)
        return false;

    const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);

    if (!match)
        return false;

    const token = decodeURIComponent(match[1]);
    const dotIndex = token.indexOf(".");

    if (dotIndex === -1)
        return false;

    const expiryStr = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);

    const expiry = Number(expiryStr);

    if (!Number.isFinite(expiry) || Date.now() > expiry)
        return false;

    const expected = await hmacHex(`${username}:${expiryStr}`, secret);
    return timingSafeEqual(expected, signature);
}

"""
Verify the Lightbox_Draft multi-color correction landed as expected -
pulls the full deduction-audit trail for this exact print key, plus any
OTHER recent entries touching Sapphire Blue (2850E0/0086D6), to check for
a stray extra deduction rather than assuming. Temporary, remove after use.
"""
import json
import os
import urllib.request

AUDIT_URL = "https://3dprintroom-dashboard.pages.dev/api/deduction-audit"
FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; verify-lightbox-fix-github-actions)"

TARGET_KEY = "Lightbox_Draft__2026-08-27 22:55:54"


def log(msg):
    print(msg, flush=True)


def api_get(url, secret):
    req = urllib.request.Request(url, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    log(f"=== all audit entries for {TARGET_KEY!r} ===")
    audit = api_get(f"{AUDIT_URL}?limit=100", secret)
    for e in audit.get("entries", []):
        if e.get("printKey") == TARGET_KEY:
            log(json.dumps(e))

    log("")
    log("=== any OTHER recent entries touching Sapphire Blue (2850E0/0086D6) ===")
    for e in audit.get("entries", []):
        if e.get("printKey") != TARGET_KEY and e.get("sourceHex") in ("2850E0", "0086D6"):
            log(json.dumps(e))

    log("")
    lib = api_get(FILAMENT_URL, secret)

    log(f"=== current deductionLog[{TARGET_KEY!r}] ===")
    log(json.dumps((lib.get("deductionLog") or {}).get(TARGET_KEY)))

    log("")
    log(f"=== current historyOverrides[{TARGET_KEY!r}] ===")
    log(json.dumps((lib.get("historyOverrides") or {}).get(TARGET_KEY)))

    log("")
    log(f"=== is it in processedPrints? {TARGET_KEY in (lib.get('processedPrints') or [])} ===")

    log("")
    log("=== Sapphire Blue spool right now ===")
    blue = next((f for f in lib.get("filaments", []) if (f.get("colorHex") or "").upper() == "2850E0"), None)
    log(json.dumps(blue.get("spools") if blue else None))


if __name__ == "__main__":
    main()

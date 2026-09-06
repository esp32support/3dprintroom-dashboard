"""Temp read-only check - pull the exact printKey strings for the two
permanently-unresolvable prints (empty Charcoal Black PLA spool, and a
print with no matching ABS filament) straight from the deduction-audit
trail, so they can be written into processedPrints verbatim (write-off,
no deduction) once the KV put-quota resets."""
import json, os, urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/deduction-audit?limit=500"
UA = "Mozilla/5.0 (compatible; stuck-key-lookup-github-actions)"

def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(URL, headers={"X-Sync-Secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())

    seen = set()
    for e in data.get("entries", []):
        name = (e.get("printName") or "")
        if "anchor_pegs" in name.lower() or "0.2mm layer" in name.lower():
            k = e.get("printKey")
            if k and k not in seen:
                seen.add(k)
                print(f"{name!r} -> printKey={k!r}  reason={e.get('reason')!r}")

if __name__ == "__main__":
    main()

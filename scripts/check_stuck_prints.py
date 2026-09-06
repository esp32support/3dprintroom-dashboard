"""Temp read-only check - inspect the two prints that are storming the
audit log (Charcoal Black PLA empty spool, unmatched ABS black), and the
current filament library state around them, to prep a fix to apply the
instant the KV put-quota resets."""
import json, os, urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
UA = "Mozilla/5.0 (compatible; stuck-print-check-github-actions)"

def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(URL, headers={"X-Sync-Secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    print("=== Charcoal / Black PLA filaments ===")
    for f in data.get("filaments", []):
        if "charcoal" in (f.get("color") or "").lower() or (f.get("material") == "PLA" and "black" in (f.get("color") or "").lower()):
            print(json.dumps(f, indent=2))

    print()
    print("=== ABS filaments (any color) ===")
    for f in data.get("filaments", []):
        if f.get("material") == "ABS":
            spools = f.get("spools", [])
            active = [s for s in spools if not s.get("removedAt")]
            print(f"  {f.get('color')} [{f.get('colorHex')}]  active_spools={len(active)}  ids={[s.get('id') for s in active]}  remaining={[s.get('remaining') for s in active]}  filamentId={f.get('id')}")

    print()
    print("=== processedPrints containing 'anchor' ===")
    for p in data.get("processedPrints", []):
        if "anchor" in p.lower():
            print(repr(p))

if __name__ == "__main__":
    main()

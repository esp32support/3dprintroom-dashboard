"""Temp read-only check v2 - broaden match to the SKIP reason itself
rather than an exact print-name substring, since the first pass missed
the ABS print (name substring guess was probably slightly off)."""
import json, os, urllib.request

URL = "https://3dprintroom-dashboard.pages.dev/api/deduction-audit?limit=1000"
UA = "Mozilla/5.0 (compatible; stuck-key-lookup-github-actions)"

def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    req = urllib.request.Request(URL, headers={"X-Sync-Secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())

    seen = set()
    for e in data.get("entries", []):
        reason = (e.get("reason") or "")
        if "no library filament matched" in reason or "no active spool with weight remaining" in reason:
            k = e.get("printKey")
            if k and k not in seen:
                seen.add(k)
                print(f"name={e.get('printName')!r} -> printKey={k!r}  reason={reason!r}  sourceHex={e.get('sourceHex')!r} sourceMaterial={e.get('sourceMaterial')!r}")

if __name__ == "__main__":
    main()

"""Temp check - current state of relevant spools + full amsDetail for the
missing FiatEmblem_PART1_base_CANDIDATE_v4.stl print (task 1224937820)."""
import json
import os
import urllib.request

FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
TASK_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-task"
USER_AGENT = "Mozilla/5.0 (compatible; spool-check-github-actions)"


def api_get(url, secret):
    req = urllib.request.Request(url, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]

    lib = api_get(FILAMENT_URL, secret)
    print("=== FiatEmblem-relevant spools (white PLA + black PETG) ===")
    for f in lib.get("filaments", []):
        hexcol = (f.get("colorHex") or "").upper()
        if hexcol in ("FFFFFF", "161616"):
            for s in f.get("spools", []):
                if not s.get("removedAt"):
                    print(f"{f.get('color')} [{hexcol}] {f.get('material')} spool={s.get('id')} remaining={s.get('remaining')}")

    print()
    print("=== historyOverrides matching 'FiatEmblem' ===")
    for k, v in lib.get("historyOverrides", {}).items():
        if "fiatemblem" in k.lower():
            print(k, "->", json.dumps(v))

    print()
    print("=== processedPrints matching 'FiatEmblem' ===")
    for k in lib.get("processedPrints", []):
        if "fiatemblem" in k.lower():
            print(k)

    print()
    print("=== deductionLog matching 'FiatEmblem' ===")
    for k, v in lib.get("deductionLog", {}).items():
        if "fiatemblem" in k.lower():
            print(k, "->", json.dumps(v))

    tasks = api_get(TASK_URL, secret).get("tasks", [])
    v4 = next((t for t in tasks if t.get("id") == 1224937820), None)
    print()
    print("=== Task 1224937820 (CANDIDATE_v4) full detail ===")
    print(json.dumps(v4, indent=2))


if __name__ == "__main__":
    main()

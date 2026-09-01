"""
Temporary: checks Task API and the filament library's own state for both
Basic_Purple.3mf history entries (12:01:23 Paused / 4m29s, and 12:06:08 /
18m24s) - is the real Task API match attached to the wrong (paused)
timestamp instead of the one that actually finished? Remove after use.
"""
import json
import os
import urllib.request

TASK_URL = "https://3dprintroom-dashboard.pages.dev/api/printer-task"
FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; check-basic-purple-github-actions)"


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

    log("=== recent Task API entries touching Basic_Purple/purple ===")
    tasks = api_get(TASK_URL, secret)
    for t in tasks.get("tasks", []):
        title = (t.get("title") or "")
        if "purple" in title.lower() or "Purple" in title:
            log(json.dumps(t))
    log("")
    log("=== ALL recent Task API entries (title/start/weight only) ===")
    for t in tasks.get("tasks", [])[:15]:
        log(json.dumps({
            "id": t.get("id"),
            "title": t.get("title"),
            "startTime": t.get("startTime"),
            "weight": t.get("weight"),
            "amsDetail": t.get("amsDetail"),
        }))

    log("")
    lib = api_get(FILAMENT_URL, secret)
    log("=== deductionLog entries mentioning Purple ===")
    for key, entry in (lib.get("deductionLog") or {}).items():
        if "purple" in key.lower():
            log(f"{key} :: {json.dumps(entry)}")
    log("")
    log("=== historyOverrides mentioning Purple ===")
    for key, ov in (lib.get("historyOverrides") or {}).items():
        if "purple" in key.lower():
            log(f"{key} :: {json.dumps(ov)}")
    log("")
    log("=== processedPrints mentioning Purple ===")
    for key in (lib.get("processedPrints") or []):
        if "purple" in key.lower():
            log(key)

    log("")
    log("=== Basic Purple filament in library ===")
    for f in lib.get("filaments", []):
        if "purple" in (f.get("color") or "").lower():
            log(json.dumps({
                "id": f.get("id"), "material": f.get("material"),
                "color": f.get("color"), "colorHex": f.get("colorHex"),
                "spools": f.get("spools"),
            }))


if __name__ == "__main__":
    main()

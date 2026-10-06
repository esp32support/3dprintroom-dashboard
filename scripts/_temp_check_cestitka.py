import json, os, urllib.request
UA = "Mozilla/5.0 (compatible; check-github-actions)"
def get(url, secret):
    req = urllib.request.Request(url, headers={"X-Sync-Secret": secret, "User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())
s = os.environ["FILAMENT_SYNC_SECRET"]
import datetime
print("now utc:", datetime.datetime.utcnow().isoformat() + "Z")
tasks = get("https://3dprintroom-dashboard.pages.dev/api/printer-task", s).get("tasks", [])
for t in tasks[:4]:
    print(json.dumps({k: t[k] for k in ("id","title","weight","startTime","endTime")}), "ams:", [(d["type"], d["weight"]) for d in t["amsDetail"]])
lib = get("https://3dprintroom-dashboard.pages.dev/api/device-filament", s)
print("recoveredTaskIds (last 6):", lib.get("recoveredTaskIds", [])[-6:])
for k, v in lib.get("historyOverrides", {}).items():
    if "cestitka" in k.lower():
        print("override", repr(k), json.dumps(v))
for k in lib.get("processedPrints", []):
    if "cestitka" in k.lower():
        print("processed", repr(k))

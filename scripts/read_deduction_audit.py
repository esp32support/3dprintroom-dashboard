"""
Prints the deduction audit trail (/api/deduction-audit) - the per-print,
per-color record of every automatic spool change the dashboard made:
which colorHex the source reported, whether an explicit AMS slot
assignment or a fuzzy color match decided the target, which filament and
spool it landed on, and the spool's remaining weight before and after.

Run on demand from the Actions tab (workflow_dispatch) when a spool's
number looks wrong - this is the thing that answers "why", which the
filament library's own deductionLog cannot.

  FILAMENT_AUDIT_LIMIT  how many of the most recent entries to print
                        (default 60, empty/0 for all)
  FILAMENT_AUDIT_FILTER substring to match against print name, filament
                        color, or hex - case-insensitive, optional
"""
import json
import os
import urllib.request

AUDIT_URL = "https://3dprintroom-dashboard.pages.dev/api/deduction-audit"
USER_AGENT = "Mozilla/5.0 (compatible; deduction-audit-reader-github-actions)"


def log(msg):
    print(msg, flush=True)


def main():
    limit = os.environ.get("FILAMENT_AUDIT_LIMIT", "60").strip()
    url = AUDIT_URL
    if limit and limit != "0":
        url = f"{AUDIT_URL}?limit={limit}"

    req = urllib.request.Request(url, headers={
        "X-Sync-Secret": os.environ["FILAMENT_SYNC_SECRET"],
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read())

    entries = data.get("entries", [])
    needle = os.environ.get("FILAMENT_AUDIT_FILTER", "").strip().lower()

    if needle:
        entries = [
            e for e in entries
            if needle in json.dumps(e).lower()
        ]

    log(f"{data.get('count', 0)} entries stored, showing {len(entries)}"
        + (f" matching {needle!r}" if needle else ""))
    log("")

    for e in entries:
        event = e.get("event", "?")
        ts = e.get("ts", "")[:19].replace("T", " ")

        head = f"[{ts}] {event.upper():<7} {e.get('printName') or e.get('printKey', '?')}"
        log(head)

        line = f"          source={e.get('source','?')}  reported={e.get('sourceHex','?')} {e.get('sourceMaterial','')}".rstrip()

        # How the target was chosen is the single most useful detail here -
        # a wrong spool is almost always a wrong CHOICE, not wrong maths.
        # Only rows that actually went through that choice carry the flag,
        # so purge/reconcile rows don't claim a decision they never made.
        if "viaSlotAssignment" in e:
            chose = "slot assignment" if e["viaSlotAssignment"] else "color match"
            slot = e.get("slotIndex")
            line += f"  via {chose}" + (f" (slot {slot})" if slot is not None else " (no slot reported)")

        log(line)

        if e.get("filamentId"):
            log(f"          -> {e.get('filamentColor','?')} [{e.get('filamentColorHex','?')}]"
                f" {e.get('filamentMaterial','')}  spool={e.get('spoolId','?')}")

        if event in ("deduct", "refund"):
            sign = "-" if event == "deduct" else "+"
            log(f"          {e.get('remainingBefore', 0):.2f}g {sign}{abs(e.get('delta', 0)):.2f}g"
                f" = {e.get('remainingAfter', 0):.2f}g"
                + (f"   (claimed {e['weightClaimed']:.2f}g, already taken {e.get('alreadyDeducted', 0):.2f}g)"
                   if e.get("weightClaimed") is not None else ""))
        elif event == "purge":
            log(f"          dropped {e.get('delta', 0):.2f}g stale row {e.get('sourceHex','?')}"
                f" (correct was {e.get('correctHex','?')}) - no refund")

        if e.get("reason"):
            log(f"          reason: {e['reason']}")

        log("")


if __name__ == "__main__":
    main()

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
FILAMENT_URL = "https://3dprintroom-dashboard.pages.dev/api/device-filament"
USER_AGENT = "Mozilla/5.0 (compatible; deduction-audit-reader-github-actions)"


def log(msg):
    print(msg, flush=True)


def api_get(url, secret):
    req = urllib.request.Request(url, headers={
        "X-Sync-Secret": secret,
        "User-Agent": USER_AGENT,
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def print_current_state(secret):
    """The audit trail explains CHANGES; this is the state those changes
    landed on. Printed together so a single run answers both "what does
    this spool read now" and "what moved it there" - checking one without
    the other is what made earlier investigations slow."""
    try:
        lib = api_get(FILAMENT_URL, secret)
    except Exception as e:
        log(f"(couldn't read current spool state: {e})")
        return

    filaments = lib.get("filaments", [])
    assignments = lib.get("slotAssignments") or {}

    log("=== CURRENT SLOT ASSIGNMENTS ===")
    if not assignments:
        log("  (none set)")
    for slot, fid in sorted(assignments.items(), key=lambda kv: int(kv[0])):
        f = next((x for x in filaments if x.get("id") == fid), None)
        # 254 is Bambu's external-spool sentinel, everything else is A1-A4.
        label = "EXT" if slot == "254" else f"A{int(slot) + 1}"
        if f:
            active = [s for s in f.get("spools", []) if not s.get("removedAt")]
            weights = ", ".join(f"{s.get('remaining', 0):.2f}g" for s in active) or "no active spool"
            log(f"  {label:<4} -> {f.get('color','?')} [{f.get('colorHex','?')}] {f.get('material','')}  {weights}")
        else:
            log(f"  {label:<4} -> {fid}  (NOT FOUND in library)")

    log("")
    log("=== ALL ACTIVE SPOOLS ===")
    for f in filaments:
        for s in f.get("spools", []):
            if s.get("removedAt"):
                continue
            log(f"  {f.get('color','?'):<22} [{f.get('colorHex','?')}] {f.get('material',''):<5}"
                f" {s.get('remaining', 0):8.2f} / {s.get('total', 0)}   spool={s.get('id')}")

    log("")


def main():
    secret = os.environ["FILAMENT_SYNC_SECRET"]
    print_current_state(secret)

    limit = os.environ.get("FILAMENT_AUDIT_LIMIT", "60").strip()
    url = AUDIT_URL
    if limit and limit != "0":
        url = f"{AUDIT_URL}?limit={limit}"

    data = api_get(url, secret)

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

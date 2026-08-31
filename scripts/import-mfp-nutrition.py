#!/usr/bin/env python3
"""One-time backfill of daily calorie totals from MyFitnessPal into `daily_nutrition`.

Health Connect only retains ~30 days and MyFitnessPal only syncs forward from the day the
integration was switched on (1 Aug 2026 here), so history before that has to be scraped.

Reads the session cookie from `.mfp-cookie` (gitignored), scrapes the classic web food diary
one day at a time, caches to `scripts/mfp-nutrition.json` (resumable — safe to Ctrl-C and
re-run), and writes `supabase/migrations/0005_import_nutrition.sql`.

    python3 scripts/import-mfp-nutrition.py --user-id <supabase-uid> --from 2025-10-13 --to 2026-08-01

Output (scrape cache + generated SQL) is gitignored — it's personal data, not part of the
feature. Other users only need this if they want history from before Health Connect had it.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time

import requests
from bs4 import BeautifulSoup

ROOT = pathlib.Path(__file__).resolve().parent.parent
COOKIE_FILE = ROOT / ".mfp-cookie"
CACHE_FILE = ROOT / "scripts" / "mfp-nutrition.json"
SQL_FILE = ROOT / "supabase" / "migrations" / "0005_import_nutrition.sql"

DEFAULT_USER_ID = "73d19a65-767c-4547-b510-19b8700c8fb8"
UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
REQUEST_DELAY_S = 0.7
MAX_PLAUSIBLE_KCAL = 20000  # matches the daily_nutrition CHECK constraint


def load_cookie() -> str:
    if not COOKIE_FILE.exists():
        sys.exit(f"missing {COOKIE_FILE} — see docs/mfp-health-connect-setup.md")
    raw = COOKIE_FILE.read_text().strip()
    raw = re.sub(r"^\s*cookie:\s*", "", raw, flags=re.I).strip().strip("\"'")
    if len(raw) < 40 or "=" not in raw:
        sys.exit(".mfp-cookie doesn't look like a cookie header")
    return raw


def daterange(a: dt.date, b: dt.date):
    d = a
    while d <= b:
        yield d
        d += dt.timedelta(days=1)


def looks_blocked(html: str) -> str | None:
    low = html.lower()
    if "just a moment" in low or "cf-browser-verification" in low:
        return "Cloudflare challenge"
    if "diary" not in low and ("password" in low and ("log in" in low or "sign in" in low)):
        return "redirected to login (cookie expired or incomplete)"
    return None


def parse_calories(html: str) -> int | None:
    """The classic diary renders a row whose first cell is 'Totals'; the next cell is kcal."""
    soup = BeautifulSoup(html, "html.parser")
    for tr in soup.find_all("tr"):
        cells = tr.find_all("td")
        if len(cells) < 2:
            continue
        if cells[0].get_text(strip=True).lower() in ("totals", "total"):
            m = re.search(r"[\d,]+", cells[1].get_text(" ", strip=True))
            if m:
                return int(m.group(0).replace(",", ""))
    return None


def build_sql(data: dict[str, int], user_id: str) -> str:
    rows = sorted((d, k) for d, k in data.items() if isinstance(k, int) and 0 < k < MAX_PLAUSIBLE_KCAL)
    lines = [
        "-- One-time import of MyFitnessPal daily calorie totals, scraped via",
        "-- scripts/import-mfp-nutrition.py. Safe to re-run: upserts by (user_id, date).",
        "-- Days with no food logged in MFP are omitted rather than stored as 0.",
        "",
        "insert into daily_nutrition (user_id, date, kcal, source) values",
    ]
    lines += [
        f"  ('{user_id}', '{d}', {k}, 'import')" + ("," if i < len(rows) - 1 else "")
        for i, (d, k) in enumerate(rows)
    ]
    lines += [
        "on conflict (user_id, date) do update set kcal = excluded.kcal, source = 'import';",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", default="2025-10-13")
    ap.add_argument("--to", dest="end", default="2026-08-01")
    ap.add_argument("--user-id", default=DEFAULT_USER_ID, help="Supabase auth uid for the insert rows")
    args = ap.parse_args()
    start = dt.date.fromisoformat(args.start)
    end = dt.date.fromisoformat(args.end)

    cache: dict[str, int | None] = {}
    if CACHE_FILE.exists():
        cache = json.loads(CACHE_FILE.read_text())
        print(f"resuming — {len(cache)} days already fetched")

    session = requests.Session()
    session.headers.update({"User-Agent": UA, "Cookie": load_cookie()})

    todo = [d for d in daterange(start, end) if d.isoformat() not in cache]
    print(f"{len(todo)} days to fetch ({start} .. {end})")

    for i, day in enumerate(todo, 1):
        key = day.isoformat()
        try:
            r = session.get(
                f"https://www.myfitnesspal.com/food/diary?date={key}", timeout=30
            )
            r.raise_for_status()
        except requests.RequestException as e:
            print(f"\n{key}: request failed ({e}) — stopping, rerun to resume")
            break

        blocked = looks_blocked(r.text)
        if blocked:
            print(f"\n{key}: {blocked}")
            print("--- first 600 chars of response ---")
            print(r.text[:600])
            break

        kcal = parse_calories(r.text)
        cache[key] = kcal
        CACHE_FILE.write_text(json.dumps(cache, indent=0, sort_keys=True))

        if i % 20 == 0 or i == len(todo):
            got = sum(1 for v in cache.values() if v)
            print(f"  {i}/{len(todo)}  {key} -> {kcal!r:>6}   ({got} days with data)")
        time.sleep(REQUEST_DELAY_S)

    have = {d: k for d, k in cache.items() if isinstance(k, int) and k > 0}
    SQL_FILE.write_text(build_sql(cache, args.user_id))
    print(f"\nwrote {SQL_FILE.relative_to(ROOT)} — {len(have)} rows")
    missing = [d for d, k in cache.items() if not k]
    if missing:
        print(f"{len(missing)} days had no logged calories (omitted)")


if __name__ == "__main__":
    main()

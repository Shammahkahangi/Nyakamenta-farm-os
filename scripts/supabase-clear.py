#!/usr/bin/env python3
"""
Clear Supabase tables used by the estate web sync.

Default (--dispatch-only):
  - contracts (domestic dispatch register)
  - finance_items mirrored from dispatch (source_module = dispatch_contract)

Full fresh start (--fresh-start):
  - Clears transactional tables on Supabase
  - Keeps blocks (acreage) and workforce
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))

DISPATCH_IDS = ("DOM-MO37XMFX", "DOM-MO4PYJ6S", "DOM-MQZMSHUX")

FRESH_START_CLEAR = [
    "batches",
    "contracts",
    "insights",
    "finance_items",
]

PRESERVE = {"blocks", "workforce"}


def load_env() -> dict[str, str]:
    env: dict[str, str] = {}
    path = os.path.join(ROOT, ".env")
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k] = v
    return env


def sb_request(env: dict[str, str], method: str, path: str, prefer: str = "return=representation") -> tuple[int, str]:
    url = env["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_KEY", "")
    if not key:
        raise SystemExit("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_KEY in .env")

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }
    req = urllib.request.Request(url, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
            return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def count_rows(env: dict[str, str], table: str, filt: str = "select=id&limit=1") -> str:
    url_path = f"{table}?{filt}"
    url = env["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + url_path
    key = env.get("SUPABASE_SERVICE_ROLE_KEY") or env.get("SUPABASE_KEY", "")
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Prefer": "count=exact",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            cr = resp.headers.get("Content-Range", "")
            return cr.split("/")[-1] if "/" in cr else "?"
    except urllib.error.HTTPError as e:
        return f"ERR {e.code}"


def delete_filter(env: dict[str, str], table: str, filt: str) -> int:
    status, body = sb_request(env, "DELETE", f"{table}?{filt}")
    if status not in (200, 204):
        print(f"  FAILED {table} ({filt}): HTTP {status} {body}", file=sys.stderr)
        return 0
    if not body:
        return 0
    try:
        rows = json.loads(body)
        return len(rows) if isinstance(rows, list) else 0
    except json.JSONDecodeError:
        return 0


def clear_dispatch(env: dict[str, str]) -> None:
    print("\n--- Clear dispatch on Supabase ---")
    before = count_rows(env, "contracts")
    print(f"contracts before: {before}")

    n = delete_filter(env, "contracts", "id=neq.")
    print(f"deleted contracts: {n}")

    for cid in DISPATCH_IDS:
        n = delete_filter(env, "contracts", f"id=eq.{cid}")
        if n:
            print(f"deleted contract {cid}: {n}")

    # Older Supabase finance_items schema has no source_module — match description only.
    n = delete_filter(env, "finance_items", "description=ilike.*Domestic%20dispatch*")
    print(f"deleted finance_items (Domestic dispatch): {n}")

    n = delete_filter(env, "finance_items", "category=eq.Green%20coffee%20sale%20(domestic)")
    print(f"deleted finance_items (Green coffee sale): {n}")

    after = count_rows(env, "contracts")
    print(f"contracts after: {after}")


def clear_fresh_start(env: dict[str, str]) -> None:
    print("\n--- Fresh start on Supabase (keep blocks + workforce) ---")
    for table in FRESH_START_CLEAR:
        before = count_rows(env, table)
        print(f"{table} before: {before}")
        n = delete_filter(env, table, "id=neq.")
        print(f"  deleted: {n}")
        after = count_rows(env, table)
        print(f"  after: {after}")

    for table in sorted(PRESERVE):
        print(f"kept {table}: {count_rows(env, table)} rows")


def main() -> None:
    parser = argparse.ArgumentParser(description="Clear estate data on Supabase")
    parser.add_argument(
        "--fresh-start",
        action="store_true",
        help="Clear batches, contracts, insights, finance_items (keep blocks + workforce)",
    )
    args = parser.parse_args()

    env = load_env()
    print("Supabase:", env.get("SUPABASE_URL", "(missing)"))

    clear_dispatch(env)
    if args.fresh_start:
        clear_fresh_start(env)

    print("\nDone. Reload the web app (hard refresh).")


if __name__ == "__main__":
    main()

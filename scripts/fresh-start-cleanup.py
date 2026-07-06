#!/usr/bin/env python3
"""
Wipe transactional/test data while preserving:
  - blocks (acreage register)
  - workforce roster
  - maintenance_rate_sets / maintenance_rate_lines
"""
import os
import sqlite3

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))

TABLES_TO_CLEAR = [
    "batches",
    "contracts",
    "insights",
    "ipm_scouting",
    "sacco_savings",
    "sacco_loans",
    "sacco_repayments",
    "sacco_finance_items",
    "sacco_members",
    "lodge_bookings",
    "lodge_payments",
    "lodge_expenses",
    "payroll_lines",
    "payroll_runs",
    "logbook_tasks",
    "logbook_minutes",
    "worker_notes",
    "logbook_complaints",
    "logbook_attachments",
    "viva_enquiries",
    "fertility_applications",
    "irrigation_logs",
    "shade_trees",
    "stumping_cycles",
    "nursery_batches",
    "finance_items",
    "inventory",
    "mother_gardens",
    "soil_records",
]

DB_PATHS = [
    os.path.join(ROOT, "data", "estate.db"),
    os.path.join(os.environ.get("APPDATA", ""), "coffee-estate-os", "estate.db"),
]


def table_exists(cur, name):
    cur.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
        (name,),
    )
    return cur.fetchone()[0] > 0


def cleanup(db_path: str) -> None:
    if not os.path.isfile(db_path):
        print(f"SKIP (missing): {db_path}")
        return

    print(f"\n=== {db_path} ===")
    db = sqlite3.connect(db_path)
    cur = db.cursor()
    cur.execute("PRAGMA foreign_keys = OFF")

    for table in TABLES_TO_CLEAR:
        if not table_exists(cur, table):
            continue
        cur.execute(f"DELETE FROM {table}")
        if cur.rowcount:
            print(f"  cleared {table}: {cur.rowcount}")
        try:
            cur.execute("DELETE FROM sqlite_sequence WHERE name=?", (table,))
        except sqlite3.Error:
            pass

    cur.execute("DELETE FROM workforce WHERE lower(trim(name)) = 'total'")
    if cur.rowcount:
        print(f"  removed workforce 'total' rows: {cur.rowcount}")

    cur.execute("UPDATE workforce SET sacco_member = 0")
    if cur.rowcount:
        print(f"  reset sacco_member on workforce: {cur.rowcount}")

    cur.execute(
        "UPDATE blocks SET yield = 0, cost = 0, revenue = 0, kgProcessed = 0"
    )
    if cur.rowcount:
        print(f"  reset block yield metrics: {cur.rowcount}")

    db.commit()
    cur.execute("VACUUM")
    db.close()
    print("  done")


if __name__ == "__main__":
    for p in DB_PATHS:
        cleanup(p)
    print("\nFresh-start cleanup complete.")

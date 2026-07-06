import os
import sqlite3

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
TARGET_IDS = {"DOM-MO37XMFX", "DOM-MO4PYJ6S", "DOM-MQZMSHUX"}

DB_PATHS = [
    os.path.join(ROOT, "data", "estate.db"),
    os.path.join(ROOT, "data", "estate.db.bak"),
    os.path.join(os.environ.get("APPDATA", ""), "coffee-estate-os", "estate.db"),
]


def clear_dispatch(db_path: str) -> None:
    if not os.path.isfile(db_path):
        print(f"SKIP (missing): {db_path}")
        return

    print(f"\n=== {db_path} ===")
    db = sqlite3.connect(db_path)
    cur = db.cursor()

    cur.execute("SELECT COUNT(*) FROM contracts")
    before = cur.fetchone()[0]
    print(f"contracts before: {before}")

    if before:
        cur.execute("SELECT id FROM contracts")
        ids = [r[0] for r in cur.fetchall()]
        print("  ids:", ids)

    cur.execute("DELETE FROM contracts")
    deleted_contracts = cur.rowcount
    print(f"deleted contracts: {deleted_contracts}")

    cur.execute(
        "DELETE FROM finance_items WHERE source_module = 'dispatch_contract'"
    )
    deleted_fin = cur.rowcount
    print(f"deleted dispatch finance (source_module): {deleted_fin}")

    for cid in TARGET_IDS:
        cur.execute(
            "DELETE FROM finance_items WHERE source_id = ? OR description LIKE ?",
            (cid, f"%{cid}%"),
        )
        if cur.rowcount:
            print(f"deleted finance for {cid}: {cur.rowcount}")

    cur.execute(
        "DELETE FROM finance_items WHERE description LIKE '%Domestic dispatch%'"
    )
    if cur.rowcount:
        print(f"deleted finance by description: {cur.rowcount}")

    db.commit()
    cur.execute("VACUUM")
    db.close()
    print("vacuum complete")

    with open(db_path, "rb") as f:
        data = f.read()
    found = {i: (i.encode() in data) for i in TARGET_IDS}
    print("id strings remaining in file:", found)


if __name__ == "__main__":
    for p in DB_PATHS:
        clear_dispatch(p)
    print("\nDone. Restart the app to refresh the dispatch register.")

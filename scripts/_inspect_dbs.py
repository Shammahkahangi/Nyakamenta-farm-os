import os
import sqlite3

paths = [
    os.path.join(os.environ.get("APPDATA", ""), "coffee-estate-os", "estate.db"),
    os.path.join(os.path.dirname(__file__), "..", "data", "estate.db"),
]

for p in paths:
    p = os.path.normpath(p)
    print(f"\n=== {p} (exists={os.path.isfile(p)}) ===")
    if not os.path.isfile(p):
        continue
    db = sqlite3.connect(p)
    cur = db.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    for (name,) in cur.fetchall():
        try:
            c = cur.execute(f"SELECT COUNT(*) FROM {name}").fetchone()[0]
            if c:
                print(f"  {name}: {c}")
        except Exception:
            pass
    try:
        rows = cur.execute(
            "SELECT id, buyer, destination, grade, netKg, pricePerKg, totalValue, status, etd FROM contracts"
        ).fetchall()
        print("  contracts detail:", rows)
    except Exception as e:
        print("  contracts error:", e)
    try:
        rows = cur.execute(
            "SELECT id, category, description, amount, source_module, source_id FROM finance_items "
            "WHERE source_module = 'dispatch_contract' OR description LIKE '%Domestic dispatch%'"
        ).fetchall()
        print("  dispatch finance:", rows)
    except Exception as e:
        print("  finance error:", e)

#!/usr/bin/env python3
"""
SYSTEMHOME - Migracion REAL SQLite -> PostgreSQL
Migra registros y relaciones, conserva IDs, corrige mojibake y verifica integridad.

Uso:
  python backend/migrate_sqlite_to_pg.py --sqlite <ruta.sqlite> --pg <DATABASE_URL> [--verify-only]

La migracion es repetible: usa TRUNCATE ... RESTART IDENTITY CASCADE antes de cargar.
Por seguridad, ese borrado solo se permite con ALLOW_DESTRUCTIVE_MIGRATION=1.
NUNCA ejecutar contra produccion sin autorizacion y respaldo.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    sys.exit("Instalar psycopg2-binary: pip install psycopg2-binary")

# Orden de carga: padres primero, hijos despues
TABLES = [
    "roles", "permissions", "role_permissions", "users", "clients", "services",
    "technicians", "inventory_items", "inventory_movements", "requests", "request_files",
    "budgets", "budget_items", "work_orders", "work_order_assignments",
    "maintenances", "maintenance_alerts", "client_history", "order_history",
    "locations", "stock_alerts", "warranties", "warranty_claims",
    "sales", "sale_items", "payments", "invoices",
    "notifications", "audit_logs",
]

NUMERIC_COLS = {
    "budgets": {"labor", "discount", "total"},
    "budget_items": {"unit_price", "subtotal"},
    "inventory_items": {"price"},
    "sales": {"subtotal", "discount", "total", "cash_received", "cash_change"},
    "sale_items": {"unit_price", "subtotal"},
    "payments": {"amount", "cash_received", "cash_change"},
    "invoices": {"subtotal", "total"},
}

MONEY_FIELDS_IN_JSON = {"items", "items_json", "data", "new_state", "previous_state"}


def fix_mojibake(value):
    """Corrige texto UTF-8 mal decodificado como Latin-1 y reemplaza U+FFFD."""
    if not isinstance(value, str):
        return value
    try:
        repaired = value.encode("latin-1").decode("utf-8")
        if "\ufffd" not in repaired:
            return repaired
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    return value


def is_damaged(value):
    """Detecta texto con caracter de reemplazo o '?' en lugar de acento."""
    if not isinstance(value, str):
        return False
    return "\ufffd" in value or ("?" in value and " C" in value)


def clean_value(col, value):
    if value is None:
        return None
    if isinstance(value, str):
        return fix_mojibake(value)
    if isinstance(value, bytes):
        try:
            return fix_mojibake(value.decode("utf-8"))
        except UnicodeDecodeError:
            return value.hex()
    return value


def repair_from_catalog(data):
    """Restaura sale_items.item_name dañado usando inventory_items (por item_id)."""
    catalog = {}
    for row in data.get("inventory_items", ([], []))[1]:
        if row.get("id") and row.get("name"):
            catalog[int(row["id"])] = row["name"]
    fixed = 0
    for row in data.get("sale_items", ([], []))[1]:
        item_id = row.get("item_id")
        name = row.get("item_name")
        if item_id is not None and is_damaged(name) and int(item_id) in catalog:
            row["item_name"] = catalog[int(item_id)]
            fixed += 1
    if fixed:
        print(f"  Reparados desde catalogo inventory_items: {fixed} item_name")
    return data


def sqlite_rows(sqlite_path):
    import sqlite3
    con = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    data = {}
    for t in TABLES:
        try:
            cols = [r[1] for r in con.execute(f'PRAGMA table_info("{t}")')]
            if not cols:
                data[t] = ([], [])
                continue
            # Algunas tablas (ej. role_permissions) no tienen columna id
            order_col = "id" if "id" in cols else f'"{cols[0]}"'
            rows = []
            for r in con.execute(f'SELECT * FROM "{t}" ORDER BY {order_col}'):
                d = {}
                for c in cols:
                    v = r[c]
                    if c in MONEY_FIELDS_IN_JSON and isinstance(v, str):
                        v = fix_mojibake(v)
                    d[c] = clean_value(c, v)
                rows.append(d)
            data[t] = (cols, rows)
        except sqlite3.Error as e:
            print(f"  WARNING tabla {t}: {e}")
            data[t] = ([], [])
    con.close()
    return repair_from_catalog(data)


def pg_columns(cur, table):
    cur.execute(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_name=%s ORDER BY ordinal_position", (table,)
    )
    return {r[0]: r[1] for r in cur.fetchall()}


def normalize_bool(col, value, pgtype):
    if pgtype == "boolean" and value is not None:
        return bool(value)
    return value


def migrate(sqlite_path, pg_url, verify_only=False):
    data = sqlite_rows(sqlite_path)

    print("\n=== CONTEO ANTES (SQLite) ===")
    before = {}
    for t in TABLES:
        before[t] = len(data[t][1])
        print(f"  {t:26} {before[t]}")

    con = psycopg2.connect(pg_url)
    con.autocommit = False
    cur = con.cursor()

    if verify_only:
        print("\n=== VERIFICACION POSTGRES ===")
        after = {}
        for t in TABLES:
            cur.execute(f'SELECT COUNT(*) FROM "{t}"')
            after[t] = cur.fetchone()[0]
            flag = "OK" if after[t] == before[t] else "DIF"
            print(f"  {t:26} sqlite={before[t]} pg={after[t]} {flag}")
        check_integrity(cur, before)
        con.rollback()
        return

    if os.environ.get("ALLOW_DESTRUCTIVE_MIGRATION") != "1":
        con.rollback()
        raise SystemExit(
            "ABORTADO: esta migración ejecuta TRUNCATE y borraría los datos actuales de PostgreSQL.\n"
            "No se ejecutó nada. Si realmente desea reemplazar la base, respalde primero y defina "
            "ALLOW_DESTRUCTIVE_MIGRATION=1 de forma explícita."
        )

    print("\n=== CARGANDO EN POSTGRES (transaccion) ===")
    # Desactivar foreign keys temporalmente para carga con IDs explicitos
    cur.execute("SET session_replication_role = replica;")
    for t in reversed(TABLES):
        cur.execute(f'TRUNCATE TABLE "{t}" RESTART IDENTITY CASCADE;')

    for t in TABLES:
        cols, rows = data[t]
        if not rows:
            continue
        pgcols = pg_columns(cur, t)
        use_cols = [c for c in cols if c in pgcols]
        placeholders = "(" + ",".join(["%s"] * len(use_cols)) + ")"
        collist = ",".join(f'"{c}"' for c in use_cols)
        values = []
        for r in rows:
            row = []
            for c in use_cols:
                v = r[c]
                v = normalize_bool(c, v, pgcols.get(c, ""))
                row.append(v)
            values.append(tuple(row))
        sql = f'INSERT INTO "{t}" ({collist}) VALUES {placeholders}'
        cur.executemany(sql, values)
        print(f"  {t:26} insertados {len(values)}")

    cur.execute("SET session_replication_role = DEFAULT;")
    # Sincronizar secuencias con el max ID importado
    for t in TABLES:
        cols, rows = data[t]
        if not rows or "id" not in cols:
            continue
        cur.execute("SELECT pg_get_serial_sequence(%s,'id');", (t,))
        seq = cur.fetchone()[0]
        if not seq:
            continue
        maxid = max((r["id"] or 0) for r in rows)
        if maxid > 0:
            cur.execute(
                "SELECT setval(pg_get_serial_sequence(%s,'id'), %s, true);",
                (t, maxid),
            )
    con.commit()

    print("\n=== CONTEO DESPUES (Postgres) ===")
    after = {}
    for t in TABLES:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        after[t] = cur.fetchone()[0]
        flag = "OK" if after[t] == before[t] else "DIF"
        print(f"  {t:26} sqlite={before[t]} pg={after[t]} {flag}")
    check_integrity(cur, before)
    con.close()


def check_integrity(cur, before):
    print("\n=== INTEGRIDAD ===")
    # Foreign keys violations
    cur.execute("""
        SELECT conrelid::regclass AS tbl, conname
        FROM pg_constraint
        WHERE contype='f' AND NOT convalidated;
    """)
    invalid = cur.fetchall()
    print("  FKs no validadas:", len(invalid))

    # Chequeos especificos de relaciones
    checks = [
        ("budgets.client_id", "SELECT COUNT(*) FROM budgets b LEFT JOIN clients c ON b.client_id=c.id WHERE b.client_id IS NOT NULL AND c.id IS NULL"),
        ("sales.client_id", "SELECT COUNT(*) FROM sales s LEFT JOIN clients c ON s.client_id=c.id WHERE s.client_id IS NOT NULL AND c.id IS NULL"),
        ("sale_items.sale_id", "SELECT COUNT(*) FROM sale_items si LEFT JOIN sales s ON si.sale_id=s.id WHERE s.id IS NULL"),
        ("inventory_movements.item_id", "SELECT COUNT(*) FROM inventory_movements m LEFT JOIN inventory_items i ON m.item_id=i.id WHERE i.id IS NULL"),
        ("work_orders.client_id", "SELECT COUNT(*) FROM work_orders w LEFT JOIN clients c ON w.client_id=c.id WHERE w.client_id IS NOT NULL AND c.id IS NULL"),
        ("notifications.user_id", "SELECT COUNT(*) FROM notifications n LEFT JOIN users u ON n.user_id=u.id WHERE n.user_id IS NOT NULL AND u.id IS NULL"),
    ]
    for label, sql in checks:
        try:
            cur.execute(sql)
            print(f"  {label:32} horfanos={cur.fetchone()[0]}")
        except Exception as e:
            print(f"  {label:32} ERROR {e}")

    # Sumas monetarias
    try:
        cur.execute("SELECT ROUND(SUM(total)::numeric,2) FROM sales")
        print("  SUM(sales.total)            ", cur.fetchone()[0])
        cur.execute("SELECT ROUND(SUM(amount)::numeric,2) FROM payments")
        print("  SUM(payments.amount)        ", cur.fetchone()[0])
    except Exception as e:
        print("  SUM ERROR", e)

    # Duplicados
    for t, col in [("clients", "ruc"), ("sales", "sale_number"), ("budgets", "number"), ("work_orders", "number")]:
        try:
            cur.execute(f'SELECT COUNT(*) FROM (SELECT "{col}" FROM "{t}" GROUP BY "{col}" HAVING COUNT(*)>1) d')
            print(f"  dup {t}.{col:14} = {cur.fetchone()[0]}")
        except Exception:
            pass


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", required=True)
    ap.add_argument("--pg", required=True, help="postgresql://user:pass@host:port/db")
    ap.add_argument("--verify-only", action="store_true")
    args = ap.parse_args()
    migrate(args.sqlite, args.pg, args.verify_only)

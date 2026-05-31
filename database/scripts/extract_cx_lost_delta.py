#!/usr/bin/env python3
"""
Extract CX rows that exist in c168site dump but are MISSING in c168 (current DB backup).
Source: dump-u857194726_c168site only. Output: INSERT IGNORE only (no triggers/procedures).
"""
from __future__ import annotations

import argparse
from datetime import date, datetime
from pathlib import Path

from extract_cx_gp_merged import (
    DATE_COLUMNS,
    EXCLUDE_TABLES,
    WRITE_ORDER,
    _row_in_range_fields,
    align_table_rows,
    row_pk,
)
import extract_gp_data as egp
from extract_gp_data import (
    ALLOWED_BACKUP_TABLES,
    COMPANY_ID_TABLES,
    TX_RESTORE_COLS,
    align_row,
    backup_row_to_transaction_row,
    chunk_rows,
    col_index,
    parse_row_values,
    read_dump,
    resolve_company,
    row_matches_col,
    row_matches_company_table,
    scan_inserts,
)

C168SITE_SQL = Path(r"c:\Users\kunzz\OneDrive\Desktop\dump-u857194726_c168site-202605312008.sql")
C168_SQL = Path(r"c:\Users\kunzz\Downloads\c168 (2).sql")

CX_TABLES = set(WRITE_ORDER) | COMPANY_ID_TABLES | {
    "account", "account_company", "account_currency", "account_currency_display_order",
    "account_link", "process_day", "description",
}

# Default: business data that was actually lost (skip tables where dump PK ids differ)
DEFAULT_DELTA_TABLES = {
    "transactions", "transaction_entry", "transaction_entry_backup",
    "data_captures", "data_capture_details",
    "data_capture_summary_state", "data_capture_submit_queue",
    "submitted_processes", "transactions_rate",
    "bank_process_maintenance_resend_pending",
    "bank_process_accounting_resend_daily_guard",
    "process_accounting_posted", "process_accounting_due_dismissed",
    "company_selected_banks", "company_selected_countries",
    "account_company", "account_link",
}


def collect_company_rows(
    dump: Path,
    company_ids: set[int],
    date_from: date | None,
    date_to: date | None,
) -> dict[str, dict[str, tuple[str, str]]]:
    """table -> pk -> (columns, row)"""
    content, schemas = read_dump(dump)
    out: dict[str, dict[str, tuple[str, str]]] = {}

    for table, columns, rows in scan_inserts(content, schemas):
        if table in EXCLUDE_TABLES:
            continue
        if table.endswith("_backup") and table not in ALLOWED_BACKUP_TABLES:
            continue
        if table not in CX_TABLES:
            continue

        matched: list[str] = []
        if table == "company":
            matched = [r for r in rows if row_matches_company_table(r, company_ids)]
        elif table in COMPANY_ID_TABLES or table == "account_company":
            idx = col_index(columns, "company_id")
            matched = [r for r in rows if row_matches_col(r, idx, company_ids)]
        elif table == "account":
            ac = out.get("account_company", {})
            account_ids = set()
            for _, (_, row) in ac.items():
                vals = parse_row_values(row)
                if len(vals) >= 2:
                    try:
                        account_ids.add(int(vals[1].strip()))
                    except ValueError:
                        pass
            for r in rows:
                vals = parse_row_values(r)
                if vals and int(vals[0].strip()) in account_ids:
                    matched.append(r)
        elif table in ("account_currency", "account_currency_display_order"):
            ac = out.get("account_company", {})
            account_ids = set()
            for _, (_, row) in ac.items():
                vals = parse_row_values(row)
                if len(vals) >= 2:
                    try:
                        account_ids.add(int(vals[1].strip()))
                    except ValueError:
                        pass
            for r in rows:
                vals = parse_row_values(row)
                ai = 1 if table == "account_currency" else 1
                if len(vals) > ai and int(vals[ai].strip()) in account_ids:
                    matched.append(r)
        elif table == "account_link":
            ac = out.get("account_company", {})
            account_ids = set()
            for _, (_, row) in ac.items():
                vals = parse_row_values(row)
                if len(vals) >= 2:
                    try:
                        account_ids.add(int(vals[1].strip()))
                    except ValueError:
                        pass
            for r in rows:
                vals = parse_row_values(r)
                for vi in (1, 2):
                    if len(vals) > vi and int(vals[vi].strip()) in account_ids:
                        matched.append(r)
                        break
        elif table == "process_day":
            proc = out.get("process", {})
            proc_ids = set()
            for _, (_, row) in proc.items():
                vals = parse_row_values(row)
                if vals:
                    try:
                        proc_ids.add(int(vals[0].strip()))
                    except ValueError:
                        pass
            idx = col_index(columns, "process_id")
            matched = [r for r in rows if row_matches_col(r, idx, proc_ids)]
        elif table == "data_capture_details":
            caps = out.get("data_captures", {})
            cap_ids = set()
            for _, (_, row) in caps.items():
                vals = parse_row_values(row)
                if vals:
                    try:
                        cap_ids.add(int(vals[0].strip()))
                    except ValueError:
                        pass
            idx = col_index(columns, "capture_id")
            matched = [r for r in rows if row_matches_col(r, idx, cap_ids)]
        elif table == "transaction_entry":
            txs = out.get("transactions", {})
            tx_ids = set()
            for _, (_, row) in txs.items():
                vals = parse_row_values(row)
                if vals:
                    try:
                        tx_ids.add(int(vals[0].strip()))
                    except ValueError:
                        pass
            idx = col_index(columns, "header_id")
            if idx is None:
                idx = 1
            matched = [r for r in rows if row_matches_col(r, idx, tx_ids)]
        elif table == "description":
            proc = out.get("process", {})
            desc_ids = set()
            for _, (_, row) in proc.items():
                vals = parse_row_values(row)
                if len(vals) >= 3:
                    try:
                        desc_ids.add(int(vals[2].strip()))
                    except ValueError:
                        pass
            matched = [
                r for r in rows
                if parse_row_values(r) and int(parse_row_values(r)[0].strip()) in desc_ids
            ]
        else:
            continue

        if not matched:
            continue

        if date_from and date_to and table in DATE_COLUMNS:
            matched = [
                r for r in matched
                if _row_in_range_fields(r, columns, DATE_COLUMNS[table], date_from, date_to)
            ]
        if not matched:
            continue

        bucket = out.setdefault(table, {})
        for r in matched:
            bucket[row_pk(r, columns)] = (columns, r)

    return out


def collect_existing_pks(dump: Path, company_ids: set[int]) -> dict[str, set[str]]:
    rows = collect_company_rows(dump, company_ids, None, None)
    return {t: set(b.keys()) for t, b in rows.items()}


def delta_site_vs_c168(
    site: Path,
    c168: Path,
    company_ids: set[int],
    date_from: date,
    date_to: date,
    allowed_tables: set[str] | None = None,
) -> dict[str, list[tuple[str, str]]]:
    site_rows = collect_company_rows(site, company_ids, date_from, date_to)
    c168_pks = collect_existing_pks(c168, company_ids)

    missing: dict[str, list[tuple[str, str]]] = {}
    for table, bucket in site_rows.items():
        if allowed_tables is not None and table not in allowed_tables:
            continue
        have = c168_pks.get(table, set())
        lost = [(cols, row) for pk, (cols, row) in bucket.items() if pk not in have]
        if lost:
            missing[table] = lost
    return missing


def build_missing_transactions_from_backup(
    site: Path,
    c168: Path,
    company_ids: set[int],
    account_ids: set[int],
    missing_tx_ids: set[int],
    date_from: date,
    date_to: date,
) -> list[str]:
    """If live tx missing in c168, use latest transactions_backup row from c168site."""
    c168_content, c168_schemas = read_dump(c168)
    c168_tx_pks = collect_existing_pks(c168, company_ids).get("transactions", set())

    site_content, site_schemas = read_dump(site)
    latest: dict[int, tuple[int, str, str]] = {}

    for table, columns, rows in scan_inserts(site_content, site_schemas):
        if table != "transactions_backup":
            continue
        ci = col_index(columns, "company_id")
        bi = col_index(columns, "backup_id")
        ii = col_index(columns, "id")
        ai = col_index(columns, "account_id")
        fi = col_index(columns, "from_account_id")
        for r in rows:
            vals = parse_row_values(r)
            try:
                tx_id = int(vals[ii].strip())
            except (ValueError, IndexError, TypeError):
                continue
            if tx_id not in missing_tx_ids:
                continue
            if str(tx_id) in c168_tx_pks:
                continue
            matched = row_matches_col(r, ci, company_ids)
            if not matched:
                for idx in (ai, fi):
                    if idx is not None and idx < len(vals):
                        try:
                            if int(vals[idx].strip()) in account_ids:
                                matched = True
                                break
                        except ValueError:
                            pass
            if not matched:
                continue
            if not _row_in_range_fields(r, columns, DATE_COLUMNS["transactions_backup"], date_from, date_to):
                continue
            backup_id = int(vals[bi].strip())
            if tx_id not in latest or backup_id > latest[tx_id][0]:
                latest[tx_id] = (backup_id, r, columns)

    return [backup_row_to_transaction_row(r, cols) for _, r, cols in sorted(latest.values())]


def write_delta_sql(
    output: Path,
    missing: dict[str, list[tuple[str, str]]],
    restore_tx: list[str],
    target_schemas: dict[str, list[str]],
    site: Path,
    date_from: date,
    date_to: date,
    main_id: int,
):
    lines = [
        f"-- CX lost data ONLY from {site.name}",
        f"-- Date filter (transactional): {date_from} .. {date_to}",
        "-- INSERT IGNORE only — no CREATE TRIGGER / PROCEDURE (avoids DEFINER import errors)",
        "SET FOREIGN_KEY_CHECKS = 0;",
        "START TRANSACTION;",
        "",
    ]
    summary = []

    for table in WRITE_ORDER:
        if table not in missing or not missing[table]:
            continue
        cols = missing[table][0][0]
        rows = [row for _, row in missing[table]]
        rows, cols = align_table_rows(table, rows, cols, target_schemas)
        summary.append((table, len(rows)))
        header = f"INSERT IGNORE INTO `{table}` ({cols}) VALUES"
        chunk = 50 if table in ("data_capture_details", "transactions") else 200
        lines.append(f"-- {table}: {len(rows)} rows (missing in c168)")
        for part in chunk_rows(rows, chunk):
            lines.append(f"{header}\n{part};")
        lines.append("")

    if restore_tx:
        summary.append(("transactions (from site backup)", len(restore_tx)))
        lines.append(f"-- transactions: {len(restore_tx)} rows restored from c168site transactions_backup")
        header = f"INSERT IGNORE INTO `transactions` ({TX_RESTORE_COLS}) VALUES"
        for part in chunk_rows(restore_tx, 50):
            lines.append(f"{header}\n{part};")
        lines.append("")

    lines.extend(["COMMIT;", "SET FOREIGN_KEY_CHECKS = 1;", "", "-- Summary:"])
    for t, c in summary:
        lines.append(f"--   {t}: {c}")
    if not summary:
        lines.append("--   (no missing rows in date range)")

    output.write_text("\n".join(lines), encoding="utf-8")
    return summary


def main():
    parser = argparse.ArgumentParser(description="CX lost rows: c168site minus c168")
    parser.add_argument("--from-date", default="2026-05-01")
    parser.add_argument("--to-date", default="2026-05-31")
    parser.add_argument("--site", type=Path, default=C168SITE_SQL)
    parser.add_argument("--c168", type=Path, default=C168_SQL)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument(
        "--tables",
        default="core",
        help="core = lost business tables only; all = every CX table diff",
    )
    args = parser.parse_args()

    if args.tables == "all":
        allowed_tables = None
    elif args.tables == "core":
        allowed_tables = DEFAULT_DELTA_TABLES
    else:
        allowed_tables = {t.strip() for t in args.tables.split(",")}

    date_from = datetime.strptime(args.from_date, "%Y-%m-%d").date()
    date_to = datetime.strptime(args.to_date, "%Y-%m-%d").date()

    main_id, company_ids = resolve_company(args.site, "CX")
    egp.MAIN_COMPANY_ID = main_id
    egp.COMPANY_IDS = company_ids
    _, target_schemas = read_dump(args.c168)

    missing = delta_site_vs_c168(
        args.site, args.c168, company_ids, date_from, date_to, allowed_tables
    )

    site_all = collect_company_rows(args.site, company_ids, date_from, date_to)
    c168_tx = collect_existing_pks(args.c168, company_ids).get("transactions", set())
    missing_tx_ids = {
        int(pk) for pk in site_all.get("transactions", {}) if pk not in c168_tx
    }

    account_ids: set[int] = set()
    for _, (_, row) in collect_company_rows(args.site, company_ids, None, None).get(
        "account_company", {}
    ).items():
        vals = parse_row_values(row)
        if len(vals) >= 2:
            try:
                account_ids.add(int(vals[1].strip()))
            except ValueError:
                pass

    live_missing = [
        site_all["transactions"][pk]
        for pk in site_all.get("transactions", {})
        if pk not in c168_tx
    ]
    if live_missing:
        missing["transactions"] = live_missing

    live_ids = {
        int(pk) for pk in site_all.get("transactions", {}) if pk not in c168_tx
    }
    restore_tx = build_missing_transactions_from_backup(
        args.site, args.c168, company_ids, account_ids,
        missing_tx_ids - live_ids, date_from, date_to,
    )

    out = args.output or (
        Path(__file__).resolve().parent.parent
        / ("restore_cx_lost_from_c168site.sql" if args.tables == "all" else "restore_cx_lost_from_c168site_core.sql")
    )
    summary = write_delta_sql(
        out, missing, restore_tx, target_schemas, args.site, date_from, date_to, main_id
    )
    print(f"CX company id={main_id}")
    print(f"Written: {out}")
    for t, c in summary:
        print(f"  {t}: {c}")
    print(f"  TOTAL rows: {sum(c for _, c in summary)}")


if __name__ == "__main__":
    main()

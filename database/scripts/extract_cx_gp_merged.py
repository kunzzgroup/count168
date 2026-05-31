#!/usr/bin/env python3
"""
Merge CX + GP restore SQL from multiple backup dumps.
Date range filter for transactional data (default 2026-05-25 .. today).
Transactions restored from transactions_backup only (NOT transactions_deleted).
"""
from __future__ import annotations

import argparse
from datetime import date, datetime
from pathlib import Path

from extract_gp_data import (
    ALLOWED_BACKUP_TABLES,
    COMPANY_ID_TABLES,
    TX_RESTORE_COLS,
    align_row,
    backup_row_to_transaction_row,
    chunk_rows,
    col_index,
    collect_capture_ids,
    collect_description_ids,
    collect_process_ids,
    collect_transaction_ids,
    fourth_pass_transactions_by_account,
    parse_row_values,
    parse_schemas,
    read_dump,
    resolve_company,
    row_matches_col,
    row_matches_company_table,
    scan_inserts,
    second_pass_accounts,
    second_pass_related,
    third_pass_descriptions,
)

C168SITE_SQL = Path(r"c:\Users\kunzz\OneDrive\Desktop\dump-u857194726_c168site-202605312008.sql")
C168_SQL = Path(r"c:\Users\kunzz\Downloads\c168 (2).sql")

DEFAULT_SOURCES = [C168SITE_SQL, C168_SQL]

# Tables always included in full when company matches (master / FK).
MASTER_TABLES = {
    "company", "company_ownership", "company_auto_renew_request", "company_countries",
    "company_selected_banks", "company_selected_countries", "currency", "description",
    "account", "account_company", "account_currency", "account_currency_display_order",
    "account_link", "process", "process_day", "bank_process", "user_company_map",
    "user_company_permissions", "data_capture_templates",
}

# Date-filtered tables: any listed column in [date_from, date_to] keeps the row.
DATE_COLUMNS: dict[str, list[str]] = {
    "data_captures": ["capture_date", "created_at"],
    "data_capture_details": ["created_at"],
    "data_capture_summary_state": ["updated_at", "created_at"],
    "data_capture_submit_queue": ["created_at"],
    "submitted_processes": ["created_at"],
    "transactions": ["transaction_date", "created_at"],
    "transactions_backup": ["transaction_date", "created_at", "backup_created_at"],
    "transaction_entry": ["created_at"],
    "transaction_entry_backup": ["created_at", "backup_created_at"],
    "transactions_rate": ["created_at"],
    "bank_process_maintenance_resend_pending": ["transaction_date", "created_at"],
    "bank_process_accounting_resend_daily_guard": ["guard_date", "created_at"],
    "process_accounting_posted": ["posted_date", "created_at"],
    "process_accounting_due_dismissed": ["created_at"],
}

EXCLUDE_TABLES = {"transactions_deleted", "data_captures_deleted"}

WRITE_ORDER = [
    "company", "company_ownership", "company_auto_renew_request", "company_countries",
    "company_selected_banks", "company_selected_countries", "currency", "description",
    "account", "account_company", "account_currency", "account_currency_display_order",
    "account_link", "process", "process_day", "data_captures", "data_capture_details",
    "data_capture_templates", "data_capture_summary_state", "data_capture_submit_queue",
    "submitted_processes", "transactions", "transaction_entry", "transactions_rate",
    "bank_process", "bank_process_maintenance_resend_pending",
    "bank_process_accounting_resend_daily_guard", "process_accounting_posted",
    "process_accounting_due_dismissed", "user_company_map", "user_company_permissions",
    "transactions_backup",
]


def resolve_company_any(sources: list[Path], code: str) -> tuple[int, set[int]]:
    for source in reversed(sources):
        try:
            return resolve_company(source, code)
        except SystemExit:
            continue
    raise SystemExit(f"Company code '{code}' not found in any source: {sources}")


def parse_sql_date(val: str) -> date | None:
    val = val.strip().strip("'").strip('"')
    if not val or val.upper() == "NULL":
        return None
    part = val.split()[0]
    try:
        return datetime.strptime(part, "%Y-%m-%d").date()
    except ValueError:
        return None


def row_in_date_range(row: str, columns: str, date_from: date, date_to: date) -> bool:
    cols_list = [c.strip().strip("`") for c in columns.split(",")]
    table = None
    fields = DATE_COLUMNS.get(table or "", [])
    # table unknown here; pass fields explicitly
    return _row_in_range_fields(row, columns, fields, date_from, date_to)


def _row_in_range_fields(
    row: str, columns: str, fields: list[str], date_from: date, date_to: date
) -> bool:
    if not fields:
        return True
    vals = parse_row_values(row)
    for name in fields:
        idx = col_index(columns, name)
        if idx is None or idx >= len(vals):
            continue
        d = parse_sql_date(vals[idx])
        if d and date_from <= d <= date_to:
            return True
    return False


def row_pk(row: str, columns: str) -> str:
    vals = parse_row_values(row)
    cols = [c.strip().strip("`") for c in columns.split(",")]
    if not vals:
        return row
    if "backup_id" in cols:
        i = cols.index("backup_id")
        return f"{cols[0]}:{vals[i].strip()}"
    if "id" in cols:
        i = cols.index("id")
        return vals[i].strip()
    return row


def merge_row(existing: tuple[int, str] | None, source_rank: int, row: str) -> tuple[int, str]:
    if existing is None or source_rank >= existing[0]:
        return (source_rank, row)
    return existing


def extract_company_from_source(
    source: Path,
    source_rank: int,
    company_code: str,
    company_ids: set[int],
    date_from: date,
    date_to: date,
    merged_rows: dict[str, dict[str, tuple[int, str]]],
    merged_headers: dict[str, str],
):
    content, schemas = read_dump(source)
    for table, columns, rows in scan_inserts(content, schemas):
        if table in EXCLUDE_TABLES:
            continue
        if table.endswith("_backup") and table not in ALLOWED_BACKUP_TABLES:
            continue

        matched: list[str] = []

        if table == "company":
            matched = [r for r in rows if row_matches_company_table(r, company_ids)]
        elif table in COMPANY_ID_TABLES or table == "account_company":
            idx = col_index(columns, "company_id")
            matched = [r for r in rows if row_matches_col(r, idx, company_ids)]
        elif table == "account":
            continue  # second pass
        elif table in ("account_currency", "account_currency_display_order", "account_link"):
            continue
        elif table == "process_day":
            idx = col_index(columns, "process_id")
            continue  # third pass via process ids
        elif table == "data_capture_details":
            continue  # via capture ids
        elif table == "transaction_entry":
            continue
        elif table == "description":
            continue

        if not matched:
            continue

        if table in MASTER_TABLES:
            keep = matched
        elif table in DATE_COLUMNS:
            keep = [
                r for r in matched
                if _row_in_range_fields(r, columns, DATE_COLUMNS[table], date_from, date_to)
            ]
        else:
            keep = matched

        if not keep:
            continue

        merged_headers[table] = f"INSERT INTO `{table}` ({columns}) VALUES"
        bucket = merged_rows.setdefault(table, {})
        for r in keep:
            pk = row_pk(r, columns)
            bucket[pk] = merge_row(bucket.get(pk), source_rank, r)

    # accounts linked to company
    ac_rows = merged_rows.get("account_company", {})
    account_ids: set[int] = set()
    for _, row in ac_rows.values():
        vals = parse_row_values(row)
        if len(vals) >= 2:
            try:
                account_ids.add(int(vals[1].strip()))
            except ValueError:
                pass

    acc_ext, acc_hdr = second_pass_accounts(content, account_ids, schemas)
    for table, rows in acc_ext.items():
        merged_headers[table] = acc_hdr[table]
        bucket = merged_rows.setdefault(table, {})
        for r in rows:
            pk = row_pk(r, acc_hdr[table].split("(")[1].split(")")[0])
            bucket[pk] = merge_row(bucket.get(pk), source_rank, r)

    # build temp extracted for related passes
    extracted = {t: [v[1] for v in b.values()] for t, b in merged_rows.items()}
    proc_ids = collect_process_ids(extracted)
    cap_ids = collect_capture_ids(extracted)
    tx_ids = set(collect_transaction_ids(extracted))

    rel_ext, rel_hdr = second_pass_related(content, proc_ids, cap_ids, tx_ids, schemas)
    for table, rows in rel_ext.items():
        if table == "data_capture_details":
            cols = rel_hdr[table].split("(")[1].split(")")[0]
            rows = [
                r for r in rows
                if _row_in_range_fields(r, cols, DATE_COLUMNS["data_capture_details"], date_from, date_to)
            ]
        if not rows:
            continue
        merged_headers[table] = rel_hdr[table]
        cols = rel_hdr[table].split("(")[1].split(")")[0]
        bucket = merged_rows.setdefault(table, {})
        for r in rows:
            bucket[row_pk(r, cols)] = merge_row(bucket.get(row_pk(r, cols)), source_rank, r)

    desc_ext, desc_hdr = third_pass_descriptions(
        content, collect_description_ids(extracted), schemas
    )
    for table, rows in desc_ext.items():
        merged_headers[table] = desc_hdr[table]
        cols = desc_hdr[table].split("(")[1].split(")")[0]
        bucket = merged_rows.setdefault(table, {})
        for r in rows:
            bucket[row_pk(r, cols)] = merge_row(bucket.get(row_pk(r, cols)), source_rank, r)

    extra_tx, tx_header = fourth_pass_transactions_by_account(
        content, account_ids, tx_ids, schemas
    )
    if extra_tx:
        cols = tx_header.split("(")[1].split(")")[0] if tx_header else ""
        filtered = [
            r for r in extra_tx
            if _row_in_range_fields(r, cols, DATE_COLUMNS["transactions"], date_from, date_to)
        ]
        if filtered and tx_header:
            merged_headers["transactions"] = tx_header
            bucket = merged_rows.setdefault("transactions", {})
            for r in filtered:
                bucket[row_pk(r, cols)] = merge_row(bucket.get(row_pk(r, cols)), source_rank, r)


def build_restore_from_backup(
    sources: list[Path],
    company_ids: set[int],
    account_ids: set[int],
    live_tx_ids: set[int],
    date_from: date,
    date_to: date,
) -> list[str]:
    latest: dict[int, tuple[int, str, str]] = {}
    for rank, source in enumerate(sources):
        content, schemas = read_dump(source)
        for table, columns, rows in scan_inserts(content, schemas):
            if table != "transactions_backup":
                continue
            ci = col_index(columns, "company_id")
            bi = col_index(columns, "backup_id")
            ii = col_index(columns, "id")
            ai = col_index(columns, "account_id")
            fi = col_index(columns, "from_account_id")
            for r in rows:
                matched = row_matches_col(r, ci, company_ids)
                if not matched:
                    vals = parse_row_values(r)
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
                vals = parse_row_values(r)
                tx_id = int(vals[ii].strip())
                backup_id = int(vals[bi].strip())
                if tx_id not in latest or backup_id > latest[tx_id][0]:
                    latest[tx_id] = (backup_id, r, columns)

    restore = []
    for tx_id in sorted(latest):
        if tx_id in live_tx_ids:
            continue
        _, row, cols = latest[tx_id]
        restore.append(backup_row_to_transaction_row(row, cols))
    return restore


def align_table_rows(
    table: str,
    rows: list[str],
    columns: str,
    target_schemas: dict[str, list[str]],
) -> tuple[list[str], str]:
    source_cols = [c.strip().strip("`") for c in columns.split(",")]
    target_cols = target_schemas.get(table)
    if not target_cols or source_cols == target_cols:
        return rows, columns
    aligned = [align_row(r, source_cols, target_cols) for r in rows]
    header_cols = ", ".join(f"`{c}`" for c in target_cols)
    return aligned, header_cols


def write_merged_sql(
    output: Path,
    companies: list[tuple[str, int, set[int]]],
    merged_rows: dict[str, dict[str, tuple[int, str]]],
    merged_headers: dict[str, str],
    restore_tx: list[str],
    sources: list[Path],
    date_from: date,
    date_to: date,
    target_schemas: dict[str, list[str]],
):
    flat = {t: [v[1] for v in b.values()] for t, b in merged_rows.items()}
    company_label = companies[0][0] if len(companies) == 1 else "CX+GP"
    lines = [
        f"-- Restore {company_label} ({date_from} .. {date_to})",
        f"-- Sources: {', '.join(s.name for s in sources)} (rank: older->newer; newer wins on conflict)",
        "-- Uses INSERT IGNORE (safe re-run, no duplicate key errors)",
        "-- Rows aligned to target DB schema (c168)",
        "-- transactions_deleted EXCLUDED (not shown on website)",
        "-- Missing transactions restored from transactions_backup only",
        "SET FOREIGN_KEY_CHECKS = 0;",
        "START TRANSACTION;",
        "",
        f"-- Companies: {', '.join(f'{c}({i})' for c,i,_ in companies)}",
        "",
    ]
    summary = []
    seen = set()
    for table in WRITE_ORDER + sorted(set(flat) - set(WRITE_ORDER)):
        if table in seen or table not in flat or not flat[table]:
            continue
        seen.add(table)
        cols = merged_headers.get(table, f"INSERT INTO `{table}` VALUES")
        cols = cols.split("(")[1].split(")")[0] if "(" in cols else ""
        rows, cols = align_table_rows(table, flat[table], cols, target_schemas)
        summary.append((table, len(rows)))
        header = f"INSERT IGNORE INTO `{table}` ({cols}) VALUES" if cols else (
            merged_headers.get(table, f"INSERT INTO `{table}` VALUES").replace(
                "INSERT INTO", "INSERT IGNORE INTO", 1
            )
        )
        chunk = 50 if table in ("data_capture_details", "transactions", "transactions_backup") else 200
        lines.append(f"-- {table}: {len(rows)} rows")
        for part in chunk_rows(rows, chunk):
            lines.append(f"{header}\n{part};")
        lines.append("")

    if restore_tx:
        summary.append(("transactions (from backup)", len(restore_tx)))
        lines.append(f"-- transactions restored from transactions_backup: {len(restore_tx)} rows")
        header = f"INSERT IGNORE INTO `transactions` ({TX_RESTORE_COLS}) VALUES"
        for part in chunk_rows(restore_tx, 50):
            lines.append(f"{header}\n{part};")
        lines.append("")

    lines.extend(["COMMIT;", "SET FOREIGN_KEY_CHECKS = 1;", "", "-- Summary:"])
    for t, c in summary:
        lines.append(f"--   {t}: {c}")
    output.write_text("\n".join(lines), encoding="utf-8")
    return summary


def extract_single_company(
    code: str,
    sources: list[Path],
    date_from: date,
    date_to: date,
    output: Path,
    target_schemas: dict[str, list[str]],
) -> list[tuple[str, int]]:
    main_id, company_ids = resolve_company_any(sources, code)
    companies_info = [(code, main_id, company_ids)]
    merged_rows: dict[str, dict[str, tuple[int, str]]] = {}
    merged_headers: dict[str, str] = {}

    for rank, source in enumerate(sources):
        print(f"  [{code}] Reading {source.name} (rank {rank})...")
        try:
            _, ids = resolve_company(source, code)
        except SystemExit:
            print(f"  [{code}] not in {source.name}, skip")
            continue
        extract_company_from_source(
            source, rank, code, ids, date_from, date_to, merged_rows, merged_headers
        )

    flat = {t: [v[1] for v in b.values()] for t, b in merged_rows.items()}
    account_ids: set[int] = set()
    for row in flat.get("account_company", []):
        vals = parse_row_values(row)
        if len(vals) >= 2:
            try:
                account_ids.add(int(vals[1].strip()))
            except ValueError:
                pass

    live_tx_ids = set(collect_transaction_ids(flat))
    restore_tx = build_restore_from_backup(
        sources, company_ids, account_ids, live_tx_ids, date_from, date_to
    )

    summary = write_merged_sql(
        output, companies_info, merged_rows, merged_headers,
        restore_tx, sources, date_from, date_to, target_schemas,
    )
    print(f"  Written: {output}")
    for t, c in summary:
        print(f"    {t}: {c}")
    print(f"    TOTAL: {sum(c for _, c in summary)}")
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--from-date", default="2026-05-25")
    parser.add_argument("--to-date", default=date.today().isoformat())
    parser.add_argument("--output", type=Path, default=None, help="Output path (single company only)")
    parser.add_argument("--company", choices=("CX", "GP"), default=None, help="One company; default generates both files")
    parser.add_argument("--sources", nargs="+", type=Path, default=DEFAULT_SOURCES)
    parser.add_argument(
        "--target-schema",
        type=Path,
        default=C168_SQL,
        help="Dump defining target DB column layout (default: c168 (2).sql)",
    )
    args = parser.parse_args()

    date_from = datetime.strptime(args.from_date, "%Y-%m-%d").date()
    date_to = datetime.strptime(args.to_date, "%Y-%m-%d").date()
    sources = args.sources
    _, target_schemas = read_dump(args.target_schema)
    out_dir = Path(__file__).resolve().parent.parent

    codes = [args.company] if args.company else ("CX", "GP")
    for code in codes:
        print(f"\n=== {code} ===")
        output = args.output if args.company and args.output else (
            out_dir / f"restore_{code.lower()}_{date_from.isoformat()}_{date_to.isoformat()}.sql"
        )
        extract_single_company(code, sources, date_from, date_to, output, target_schemas)


if __name__ == "__main__":
    main()

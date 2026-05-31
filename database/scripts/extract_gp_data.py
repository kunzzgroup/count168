#!/usr/bin/env python3
"""Extract company data from SQL dump -> restore_{code}_company.sql"""
import argparse
import re
from pathlib import Path

SOURCE_SQL = Path(r"c:\Users\kunzz\Downloads\127_0_0_1.sql")

COMPANY_ID_TABLES = {
    "company_auto_renew_request", "company_countries", "company_ownership",
    "company_selected_banks", "company_selected_countries", "currency", "description",
    "process", "submitted_processes", "data_captures", "data_capture_details",
    "data_capture_templates", "data_capture_summary_state", "data_capture_submit_queue",
    "transactions", "transaction_entry", "bank_process", "user_company_map",
    "user_company_permissions", "transactions_rate", "transactions_deleted", "data_captures_deleted",
    "bank_process_maintenance_resend_pending", "bank_process_accounting_resend_daily_guard",
    "process_accounting_posted", "process_accounting_due_dismissed",
}

INSERT_RE = re.compile(r"INSERT INTO `(\w+)` \(([^)]+)\) VALUES\s*", re.IGNORECASE)

# Set by resolve_company() before extraction
COMPANY_IDS: set[int] = set()
MAIN_COMPANY_ID: int = 0
COMPANY_CODE: str = ""


def resolve_company(source: Path, code: str) -> tuple[int, set[int]]:
    """Find main company id and all related ids (incl. sub-companies) from backup."""
    content = source.read_text(encoding="utf-8", errors="replace")
    code_upper = code.upper()
    main_id = None
    pos = 0
    all_company_rows = []
    while True:
        m = INSERT_RE.search(content, pos)
        if not m:
            break
        if m.group(1) != "company":
            pos = m.end()
            continue
        start = m.end()
        end = content.find(";\n", start)
        if end == -1:
            end = content.find(";", start)
        if end == -1:
            break
        all_company_rows.extend(split_rows(content[start:end]))
        pos = end + 1

    for row in all_company_rows:
        vals = parse_row_values(row)
        if len(vals) >= 2 and vals[1].strip().strip("'").upper() == code_upper:
            main_id = int(vals[0].strip())
            break
    if main_id is None:
        raise SystemExit(f"Company code '{code}' not found in {source}")

    ids = {main_id}
    for row in all_company_rows:
        vals = parse_row_values(row)
        if len(vals) >= 3:
            try:
                if int(vals[2].strip()) == main_id:
                    ids.add(int(vals[0].strip()))
            except ValueError:
                pass
    return main_id, ids


def col_index(columns: str, name: str) -> int | None:
    cols = [c.strip().strip("`") for c in columns.split(",")]
    try:
        return cols.index(name)
    except ValueError:
        return None


def parse_row_values(row_str: str) -> list:
    row_str = row_str.strip().rstrip(",").rstrip(";")
    if not (row_str.startswith("(") and row_str.endswith(")")):
        return []
    inner = row_str[1:-1]
    values, i, n = [], 0, len(inner)
    while i < n:
        while i < n and inner[i] in " \t\n\r":
            i += 1
        if i >= n:
            break
        if inner[i] == "'":
            i += 1
            buf = []
            while i < n:
                if inner[i] == "\\" and i + 1 < n:
                    buf.append(inner[i + 1])
                    i += 2
                elif inner[i] == "'":
                    if i + 1 < n and inner[i + 1] == "'":
                        buf.append("'")
                        i += 2
                    else:
                        i += 1
                        break
                else:
                    buf.append(inner[i])
                    i += 1
            values.append("'" + "".join(buf).replace("'", "''") + "'")
        elif inner[i:i + 4].upper() == "NULL":
            values.append("NULL")
            i += 4
        else:
            j = i
            while j < n and inner[j] != ",":
                j += 1
            values.append(inner[i:j].strip())
            i = j
        while i < n and inner[i] in " \t\n\r,":
            if inner[i] == ",":
                i += 1
                break
            i += 1
    return values


def split_rows(values_block: str) -> list[str]:
    rows, depth, start, in_str, esc = [], 0, None, False, False
    for idx, ch in enumerate(values_block):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == "'":
                in_str = False
            continue
        if ch == "'":
            in_str = True
        elif ch == "(":
            if depth == 0:
                start = idx
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0 and start is not None:
                rows.append(values_block[start:idx + 1])
                start = None
    return rows


def row_matches_col(row: str, col_idx: int | None, target_ids: set) -> bool:
    if col_idx is None:
        return False
    vals = parse_row_values(row)
    if not vals or col_idx >= len(vals):
        return False
    v = vals[col_idx].strip()
    if v.upper() == "NULL":
        return False
    try:
        return int(v) in target_ids
    except ValueError:
        return False


def row_matches_company_table(row: str, company_ids: set) -> bool:
    vals = parse_row_values(row)
    if not vals:
        return False
    try:
        if int(vals[0].strip()) in company_ids:
            return True
    except ValueError:
        pass
    if len(vals) > 2:
        try:
            if int(vals[2].strip()) == MAIN_COMPANY_ID:
                return True
        except ValueError:
            pass
    return False


def extract_from_dump(source: Path):
    content = source.read_text(encoding="utf-8", errors="replace")
    extracted, insert_headers = {}, {}
    pos = 0
    while True:
        m = INSERT_RE.search(content, pos)
        if not m:
            break
        table, columns = m.group(1), m.group(2)
        start = m.end()
        end = content.find(";\n", start)
        if end == -1:
            end = content.find(";", start)
        if end == -1:
            break
        rows = split_rows(content[start:end])
        pos = end + 1
        if table.endswith("_backup"):
            continue
        matched = []
        if table == "company":
            matched = [r for r in rows if row_matches_company_table(r, COMPANY_IDS)]
        elif table in COMPANY_ID_TABLES:
            idx = col_index(columns, "company_id")
            matched = [r for r in rows if row_matches_col(r, idx, COMPANY_IDS)]
        elif table == "account_company":
            idx = col_index(columns, "company_id")
            matched = [r for r in rows if row_matches_col(r, idx, COMPANY_IDS)]
        if matched:
            insert_headers[table] = f"INSERT INTO `{table}` ({columns}) VALUES"
            extracted.setdefault(table, []).extend(matched)
    return extracted, insert_headers


def collect_account_ids(extracted: dict) -> set[int]:
    ids = set()
    for row in extracted.get("account_company", []):
        vals = parse_row_values(row)
        if len(vals) >= 2:
            try:
                ids.add(int(vals[1].strip()))
            except ValueError:
                pass
    return ids


def collect_process_ids(extracted: dict) -> set[int]:
    ids = set()
    for row in extracted.get("process", []):
        vals = parse_row_values(row)
        if vals:
            try:
                ids.add(int(vals[0].strip()))
            except ValueError:
                pass
    return ids


def collect_capture_ids(extracted: dict) -> set[int]:
    ids = set()
    for row in extracted.get("data_captures", []):
        vals = parse_row_values(row)
        if vals:
            try:
                ids.add(int(vals[0].strip()))
            except ValueError:
                pass
    return ids


def collect_description_ids(extracted: dict) -> set[int]:
    ids = set()
    for row in extracted.get("process", []):
        vals = parse_row_values(row)
        if len(vals) >= 3:
            try:
                ids.add(int(vals[2].strip()))
            except ValueError:
                pass
    return ids


def collect_transaction_ids(extracted: dict) -> set[int]:
    ids = set()
    for row in extracted.get("transactions", []):
        vals = parse_row_values(row)
        if vals:
            try:
                ids.add(int(vals[0].strip()))
            except ValueError:
                pass
    return ids


def second_pass_accounts(content: str, account_ids: set[int]):
    extracted, headers = {}, {}
    if not account_ids:
        return extracted, headers
    pos = 0
    while True:
        m = INSERT_RE.search(content, pos)
        if not m:
            break
        table, columns = m.group(1), m.group(2)
        start, end = m.end(), None
        end = content.find(";\n", start)
        if end == -1:
            end = content.find(";", start)
        if end == -1:
            break
        rows = split_rows(content[start:end])
        pos = end + 1
        if table.endswith("_backup"):
            continue
        matched = []
        if table == "account":
            for r in rows:
                vals = parse_row_values(r)
                if vals and int(vals[0].strip()) in account_ids:
                    matched.append(r)
        elif table == "account_currency":
            for r in rows:
                vals = parse_row_values(r)
                if len(vals) >= 2 and int(vals[1].strip()) in account_ids:
                    matched.append(r)
        elif table == "account_currency_display_order":
            for r in rows:
                vals = parse_row_values(r)
                if len(vals) >= 2 and int(vals[1].strip()) in account_ids:
                    matched.append(r)
        elif table == "account_link":
            for r in rows:
                vals = parse_row_values(r)
                for vi in (1, 2):
                    if len(vals) > vi and int(vals[vi].strip()) in account_ids:
                        matched.append(r)
                        break
        if matched:
            headers[table] = f"INSERT INTO `{table}` ({columns}) VALUES"
            extracted.setdefault(table, []).extend(matched)
    return extracted, headers


def second_pass_related(content: str, process_ids: set, capture_ids: set, tx_ids: set):
    extracted, headers = {}, {}
    pos = 0
    while True:
        m = INSERT_RE.search(content, pos)
        if not m:
            break
        table, columns = m.group(1), m.group(2)
        start = m.end()
        end = content.find(";\n", start)
        if end == -1:
            end = content.find(";", start)
        if end == -1:
            break
        rows = split_rows(content[start:end])
        pos = end + 1
        if table.endswith("_backup"):
            continue
        matched = []
        if table == "process_day" and process_ids:
            idx = col_index(columns, "process_id")
            matched = [r for r in rows if row_matches_col(r, idx, process_ids)]
        elif table == "data_capture_details" and capture_ids:
            idx = col_index(columns, "capture_id")
            matched = [r for r in rows if row_matches_col(r, idx, capture_ids)]
        elif table == "transaction_entry" and tx_ids:
            idx = col_index(columns, "header_id")
            if idx is None:
                idx = 1
            matched = [r for r in rows if row_matches_col(r, idx, tx_ids)]
        if matched:
            seen = set()
            unique = [r for r in matched if r not in seen and not seen.add(r)]
            headers[table] = f"INSERT INTO `{table}` ({columns}) VALUES"
            extracted[table] = unique
    return extracted, headers


def third_pass_descriptions(content: str, desc_ids: set[int]):
    extracted, headers = {}, {}
    if not desc_ids:
        return extracted, headers
    pos = 0
    while True:
        m = INSERT_RE.search(content, pos)
        if not m:
            break
        table, columns = m.group(1), m.group(2)
        start = m.end()
        end = content.find(";\n", start)
        if end == -1:
            end = content.find(";", start)
        if end == -1:
            break
        rows = split_rows(content[start:end])
        pos = end + 1
        if table.endswith("_backup") or table != "description":
            continue
        matched = [r for r in rows if parse_row_values(r) and int(parse_row_values(r)[0].strip()) in desc_ids]
        if matched:
            headers[table] = f"INSERT INTO `{table}` ({columns}) VALUES"
            extracted[table] = matched
    return extracted, headers


def fourth_pass_transactions_by_account(content: str, account_ids: set[int], existing_tx_ids: set[int]):
    extra, header = [], None
    if not account_ids:
        return extra, header
    pos = 0
    while True:
        m = INSERT_RE.search(content, pos)
        if not m:
            break
        table, columns = m.group(1), m.group(2)
        start = m.end()
        end = content.find(";\n", start)
        if end == -1:
            end = content.find(";", start)
        if end == -1:
            break
        pos = end + 1
        if table != "transactions":
            continue
        acc_idx = col_index(columns, "account_id")
        from_idx = col_index(columns, "from_account_id")
        id_idx = col_index(columns, "id")
        for r in split_rows(content[start:end]):
            vals = parse_row_values(r)
            if not vals:
                continue
            try:
                tx_id = int(vals[id_idx].strip())
                if tx_id in existing_tx_ids:
                    continue
            except (ValueError, TypeError):
                tx_id = -1
            matched = False
            for idx in (acc_idx, from_idx):
                if idx is not None and idx < len(vals):
                    try:
                        if int(vals[idx].strip()) in account_ids:
                            matched = True
                            break
                    except ValueError:
                        pass
            if matched:
                header = f"INSERT INTO `{table}` ({columns}) VALUES"
                extra.append(r)
                if tx_id >= 0:
                    existing_tx_ids.add(tx_id)
    return extra, header


def chunk_rows(rows: list[str], size: int = 100) -> list[str]:
    return [",\n".join(rows[i:i + size]) for i in range(0, len(rows), size)]


def write_sql(output: Path, extracted: dict, headers: dict):
    order = [
        "company", "company_ownership", "company_auto_renew_request", "company_countries",
        "company_selected_banks", "company_selected_countries", "currency", "description",
        "account", "account_company", "account_currency", "account_currency_display_order",
        "account_link", "process", "process_day", "data_captures", "data_capture_details",
        "data_capture_templates", "data_capture_summary_state", "data_capture_submit_queue",
        "submitted_processes", "transactions", "transaction_entry", "transactions_rate",
        "bank_process", "bank_process_maintenance_resend_pending",
        "bank_process_accounting_resend_daily_guard", "process_accounting_posted",
        "process_accounting_due_dismissed", "user_company_map", "user_company_permissions",
        "transactions_deleted", "data_captures_deleted",
    ]
    lines = [
        f"-- Restore {COMPANY_CODE} company (id={MAIN_COMPANY_ID}) from 127_0_0_1.sql backup (2026-05-29)",
        f"-- Company ids included: {sorted(COMPANY_IDS)}",
        "-- BACKUP YOUR DB FIRST. Uses INSERT IGNORE (safe re-run).",
        "SET FOREIGN_KEY_CHECKS = 0;",
        "START TRANSACTION;",
        "",
    ]
    summary = []
    seen_tables = set()
    for table in order + sorted(set(extracted) - set(order)):
        if table in seen_tables or table not in extracted or not extracted[table]:
            continue
        seen_tables.add(table)
        rows = extracted[table]
        summary.append((table, len(rows)))
        header = headers.get(table, f"INSERT INTO `{table}` VALUES").replace("INSERT INTO", "INSERT IGNORE INTO", 1)
        chunk_size = 50 if table in ("data_capture_details", "transactions", "transactions_deleted") else 200
        lines.append(f"-- {table}: {len(rows)} rows")
        for chunk in chunk_rows(rows, chunk_size):
            lines.append(f"{header}\n{chunk};")
        lines.append("")
    lines.extend(["COMMIT;", "SET FOREIGN_KEY_CHECKS = 1;", "", "-- Summary:"])
    for t, c in summary:
        lines.append(f"--   {t}: {c}")
    output.write_text("\n".join(lines), encoding="utf-8")
    return summary


def run_extraction(source: Path, output: Path):
    global COMPANY_IDS, MAIN_COMPANY_ID, COMPANY_CODE
    content = source.read_text(encoding="utf-8", errors="replace")
    extracted, headers = extract_from_dump(source)
    account_ids = collect_account_ids(extracted)
    acc_ext, acc_hdr = second_pass_accounts(content, account_ids)
    extracted.update(acc_ext)
    headers.update(acc_hdr)
    proc_ids = collect_process_ids(extracted)
    cap_ids = collect_capture_ids(extracted)
    tx_ids = collect_transaction_ids(extracted)
    rel_ext, rel_hdr = second_pass_related(content, proc_ids, cap_ids, tx_ids)
    for k, v in rel_ext.items():
        extracted.setdefault(k, []).extend(v)
    headers.update(rel_hdr)
    desc_ext, desc_hdr = third_pass_descriptions(content, collect_description_ids(extracted))
    for k, v in desc_ext.items():
        extracted.setdefault(k, []).extend(v)
    headers.update(desc_hdr)
    tx_ids = collect_transaction_ids(extracted)
    extra_tx, tx_header = fourth_pass_transactions_by_account(content, account_ids, set(tx_ids))
    if extra_tx:
        if tx_header:
            headers["transactions"] = tx_header
        extracted.setdefault("transactions", []).extend(extra_tx)
        tx_ids = collect_transaction_ids(extracted)
        rel_ext2, rel_hdr2 = second_pass_related(content, set(), set(), set(tx_ids))
        for k, v in rel_ext2.items():
            if k == "transaction_entry":
                extracted.setdefault(k, []).extend(v)
                headers.update(rel_hdr2)
    for k in extracted:
        seen, unique = set(), []
        for r in extracted[k]:
            if r not in seen:
                seen.add(r)
                unique.append(r)
        extracted[k] = unique
    summary = write_sql(output, extracted, headers)
    print(f"Company: {COMPANY_CODE} (id={MAIN_COMPANY_ID}, ids={sorted(COMPANY_IDS)})")
    print(f"Accounts: {len(account_ids)}")
    print(f"Written: {output}")
    for t, c in summary:
        print(f"  {t}: {c}")
    print(f"  TOTAL: {sum(c for _, c in summary)}")
    return summary


def main():
    parser = argparse.ArgumentParser(description="Extract company data from SQL backup")
    parser.add_argument("code", nargs="?", default="GP", help="Company code e.g. GP, CX")
    parser.add_argument("--source", type=Path, default=SOURCE_SQL)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    global COMPANY_IDS, MAIN_COMPANY_ID, COMPANY_CODE
    COMPANY_CODE = args.code.upper()
    MAIN_COMPANY_ID, COMPANY_IDS = resolve_company(args.source, COMPANY_CODE)
    output = args.output or (
        Path(__file__).resolve().parent.parent / f"restore_{COMPANY_CODE.lower()}_company.sql"
    )
    run_extraction(args.source, output)


if __name__ == "__main__":
    main()

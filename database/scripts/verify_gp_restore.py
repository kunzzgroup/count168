#!/usr/bin/env python3
"""Verify GP restore SQL against backup."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract_gp_data import *  # noqa

SOURCE = Path(r"c:\Users\kunzz\Downloads\127_0_0_1.sql")
RESTORE = Path(__file__).resolve().parent.parent / "restore_gp_company.sql"


def main():
    content = SOURCE.read_text(encoding="utf-8", errors="replace")
    extracted, _ = extract_from_dump(SOURCE)
    account_ids = collect_account_ids(extracted)
    acc_ext, _ = second_pass_accounts(content, account_ids)
    extracted.update(acc_ext)
    proc_ids = collect_process_ids(extracted)
    cap_ids = collect_capture_ids(extracted)
    tx_ids = collect_transaction_ids(extracted)
    rel_ext, _ = second_pass_related(content, proc_ids, cap_ids, tx_ids)
    for k, v in rel_ext.items():
        extracted.setdefault(k, []).extend(v)
    desc_ids = collect_description_ids(extracted)
    desc_ext, _ = third_pass_descriptions(content, desc_ids)
    for k, v in desc_ext.items():
        extracted.setdefault(k, []).extend(v)

    print("=== Extracted from backup ===")
    total = 0
    for t in sorted(extracted.keys()):
        n = len(set(extracted[t]))
        total += n
        print(f"  {t}: {n}")
    print(f"  TOTAL unique rows: {total}")

    gp_row = None
    for r in extracted.get("company", []):
        v = parse_row_values(r)
        if v and v[0].strip() == "139":
            gp_row = v
            break
    print("\n=== GP company (id=139) ===")
    if gp_row:
        print(f"  company_id=GP, owner_id={gp_row[2]}, expiry={gp_row[5]}")
    else:
        print("  MISSING!")

    print(f"\n=== Accounts linked to GP: {len(account_ids)} ===")
    print(f"  {sorted(account_ids)}")

    print("\n=== Processes for GP companies ===")
    for r in extracted.get("process", []):
        v = parse_row_values(r)
        if len(v) > 17 and v[17].strip() in {str(x) for x in GP_COMPANY_IDS}:
            print(f"  id={v[0].strip()}, code={v[1].strip()}, company_id={v[17].strip()}")

    tx139 = sum(
        1
        for r in extracted.get("transactions", [])
        if len(parse_row_values(r)) > 1 and parse_row_values(r)[1].strip() == "139"
    )
    print(f"\n=== transactions company_id=139: {tx139} ===")
    print(f"=== transactions total extracted: {len(extracted.get('transactions', []))} ===")

    restore = RESTORE.read_text(encoding="utf-8")
    print("\n=== Restore SQL file ===")
    print(f"  path: {RESTORE}")
    print(f"  size: {len(restore)} chars")
    print(f"  INSERT IGNORE: {restore.count('INSERT IGNORE')}")
    print(f"  contains id 139 GP: {'139' in restore and 'GP' in restore}")
    print(f"  has COMMIT: {'COMMIT;' in restore}")

    # Cross-check: count backup rows with company_id=139 in INSERT blocks
    backup_counts = {}
    pos = 0
    while True:
        m = INSERT_RE.search(content, pos)
        if not m:
            break
        table = m.group(1)
        columns = m.group(2)
        start = m.end()
        end = content.find(";\n", start)
        if end == -1:
            end = content.find(";", start)
        if end == -1:
            break
        values_block = content[start:end]
        pos = end + 1
        if table.endswith("_backup"):
            continue
        if table not in COMPANY_ID_TABLES and table != "account_company":
            continue
        idx = col_index(columns, "company_id")
        if idx is None and table == "account_company":
            idx = col_index(columns, "company_id")
        if idx is None:
            continue
        rows = split_rows(values_block)
        n = sum(1 for r in rows if row_matches_col(r, idx, {139}))
        if n:
            backup_counts[table] = backup_counts.get(table, 0) + n

    print("\n=== Backup rows with company_id=139 ONLY ===")
    for t, n in sorted(backup_counts.items()):
        print(f"  {t}: {n}")

    print("\n=== Potential gaps (not in deletion cascade but may matter) ===")
    gaps = []
    if "owner" not in extracted:
        gaps.append("owner id=3 (should already exist in live DB)")
    if not extracted.get("process"):
        gaps.append("process records")
    if len(extracted.get("transactions", [])) < 10:
        gaps.append("very few transactions - double check")
    for g in gaps:
        print(f"  - {g}")
    if not gaps:
        print("  none critical detected")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Compare CX/GP data between two SQL backups.
c168 (2).sql = production DB where data was LOST (newer, 5/31).
127_0_0_1.sql = older backup (5/29) with more complete data for GP.
"""
from __future__ import annotations

import sys
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extract_gp_data import col_index, parse_row_values, read_dump, resolve_company, row_matches_col, scan_inserts

OLD = ("c168site (完整)", Path(r"c:\Users\kunzz\OneDrive\Desktop\dump-u857194726_c168site-202605312008.sql"))
NEW = ("c168 (2).sql (当前库)", Path(r"c:\Users\kunzz\Downloads\c168 (2).sql"))
D_FROM, D_TO = date(2026, 5, 1), date(2026, 5, 31)

# Tables with company_id — count all rows + optional date filter
TABLES_ALL = [
    ("company", None, None),
    ("account_company", None, None),
    ("process", None, None),
    ("bank_process", None, None),
    ("user_company_map", None, None),
    ("data_capture_templates", None, None),
    ("transactions", ["transaction_date", "created_at"], "5月"),
    ("transactions_backup", ["transaction_date", "created_at", "backup_created_at"], "5月"),
    ("transactions_deleted", ["transaction_date", "created_at", "deleted_at"], "5月"),
    ("transaction_entry", ["created_at"], "5月"),
    ("transaction_entry_backup", ["created_at", "backup_created_at"], "5月"),
    ("data_captures", ["capture_date", "created_at"], "5月"),
    ("data_capture_details", ["created_at"], "5月"),
    ("process_accounting_posted", ["posted_date", "created_at"], "5月"),
    ("submitted_processes", ["created_at"], "5月"),
]


def parse_date(val: str) -> date | None:
    val = val.strip().strip("'").strip('"')
    if not val or val.upper() == "NULL":
        return None
    part = val.split()[0]
    try:
        return datetime.strptime(part, "%Y-%m-%d").date()
    except ValueError:
        return None


def in_range(row: str, cols: str, fields: list[str] | None) -> bool:
    if not fields:
        return True
    vals = parse_row_values(row)
    for f in fields:
        i = col_index(cols, f)
        if i is None or i >= len(vals):
            continue
        d = parse_date(vals[i])
        if d and D_FROM <= d <= D_TO:
            return True
    return False


def scan_file(src: Path, company_ids: set[int] | None) -> dict:
    """Scan dump; if company_ids is None, company table not resolved."""
    content, schemas = read_dump(src)
    stats: dict[str, dict] = {}
    tx_ids_all: set[int] = set()
    tx_ids_may: set[int] = set()
    backup_tx_ids_may: set[int] = set()
    company_rows: list[tuple[int, str]] = []

    for table, cols, rows in scan_inserts(content, schemas):
        if table == "company":
            ci = col_index(cols, "id")
            ccode = col_index(cols, "company_id")
            oid = col_index(cols, "owner_id")
            for r in rows:
                vals = parse_row_values(r)
                if ci is None or ccode is None:
                    continue
                try:
                    cid = int(vals[ci].strip())
                    code = vals[ccode].strip().strip("'")
                    owner = int(vals[oid].strip()) if oid is not None else None
                    company_rows.append((cid, code, owner))
                except (ValueError, IndexError):
                    pass
            continue

        if company_ids is None:
            continue

        cfg = next((t for t in TABLES_ALL if t[0] == table), None)
        if cfg is None and table not in ("transactions", "transactions_backup"):
            continue

        ci = col_index(cols, "company_id")
        if ci is None and table != "company":
            continue

        bucket = stats.setdefault(table, {"all": 0, "may": 0, "ids": set()})

        for r in rows:
            if ci is not None and not row_matches_col(r, ci, company_ids):
                continue
            bucket["all"] += 1
            date_fields = cfg[1] if cfg else None
            if in_range(r, cols, date_fields):
                bucket["may"] += 1
            if table == "transactions":
                ii = col_index(cols, "id")
                if ii is not None:
                    try:
                        tid = int(parse_row_values(r)[ii].strip())
                        tx_ids_all.add(tid)
                        if in_range(r, cols, ["transaction_date", "created_at"]):
                            tx_ids_may.add(tid)
                    except (ValueError, IndexError):
                        pass
            elif table == "transactions_backup":
                ii = col_index(cols, "id")
                if ii is not None and in_range(r, cols, ["transaction_date", "created_at", "backup_created_at"]):
                    try:
                        backup_tx_ids_may.add(int(parse_row_values(r)[ii].strip()))
                    except (ValueError, IndexError):
                        pass
            elif table == "account_company":
                ai = col_index(cols, "account_id")
                if ai is not None:
                    try:
                        bucket["ids"].add(int(parse_row_values(r)[ai].strip()))
                    except (ValueError, IndexError):
                        pass

    return {
        "stats": stats,
        "tx_ids_all": tx_ids_all,
        "tx_ids_may": tx_ids_may,
        "backup_tx_ids_may": backup_tx_ids_may,
        "company_rows": company_rows,
    }


def resolve_or_none(src: Path, code: str) -> set[int] | None:
    try:
        _, ids = resolve_company(src, code)
        return ids
    except SystemExit:
        return None


def fmt_delta(old_n: int, new_n: int) -> str:
    d = old_n - new_n
    if d > 0:
        return f"  c168 丢失 {d} 条"
    if d < 0:
        return f"  c168 多 {abs(d)} 条"
    return "  相同"


def print_company_tree(data: dict, label: str, company_ids: set[int]):
    rows = [r for r in data["company_rows"] if r[0] in company_ids]
    print(f"\n  [{label}] 公司结构 ({len(rows)} 家):")
    for cid, code, owner in sorted(rows, key=lambda x: x[0]):
        print(f"    id={cid}  code={code}  owner_id={owner}")


def compare_company(code: str):
    print(f"\n{'=' * 60}")
    print(f"  {code}")
    print(f"{'=' * 60}")

    old_ids = resolve_or_none(OLD[1], code)
    new_ids = resolve_or_none(NEW[1], code)

    if old_ids is None and new_ids is None:
        print("  两份备份均未找到该公司")
        return

    if old_ids is None:
        print(f"  {OLD[0]}: 公司不存在")
        print(f"  {NEW[0]}: company ids = {sorted(new_ids)}")
        return

    if new_ids is None:
        print(f"  {OLD[0]}: company ids = {sorted(old_ids)}")
        print(f"  {NEW[0]}: *** 整家公司已被删除 ***")
        print(f"  >>> c168 丢失整个 {code} 及 {len(old_ids)} 个关联 company id")

    old_data = scan_file(OLD[1], old_ids)
    new_data = scan_file(NEW[1], new_ids) if new_ids else {
        "stats": {}, "tx_ids_all": set(), "tx_ids_may": set(),
        "backup_tx_ids_may": set(), "company_rows": [],
    }

    print_company_tree(old_data, OLD[0], old_ids)
    if new_ids:
        print_company_tree(new_data, NEW[0], new_ids)

    print(f"\n  表统计 (全量 | 5月 {D_FROM}~{D_TO}):")
    print(f"  {'表名':<35} {'127_0_0_1':>12} {'c168':>12} {'差异说明'}")
    print(f"  {'-' * 35} {'-' * 12} {'-' * 12} {'-' * 20}")

    for table, date_fields, may_label in TABLES_ALL:
        if table == "company":
            o = len([r for r in old_data["company_rows"] if r[0] in old_ids])
            n = len([r for r in new_data["company_rows"] if new_ids and r[0] in new_ids]) if new_ids else 0
            extra = fmt_delta(o, n)
            print(f"  {table:<35} {o:>12} {n:>12} {extra}")
            continue

        os_ = old_data["stats"].get(table, {"all": 0, "may": 0})
        ns = new_data["stats"].get(table, {"all": 0, "may": 0})

        if date_fields:
            label = f"{table} (5月)"
            print(f"  {label:<35} {os_['may']:>12} {ns['may']:>12} {fmt_delta(os_['may'], ns['may'])}")
        else:
            print(f"  {table:<35} {os_['all']:>12} {ns['all']:>12} {fmt_delta(os_['all'], ns['all'])}")

    # Transaction ID diff (May)
    if old_ids and new_ids:
        lost_may = old_data["tx_ids_may"] - new_data["tx_ids_may"]
        only_new_may = new_data["tx_ids_may"] - old_data["tx_ids_may"]
        print(f"\n  5月 transactions ID 对比:")
        print(f"    127 有、c168 无 (c168 丢失): {len(lost_may)} 笔")
        if lost_may and len(lost_may) <= 30:
            print(f"      IDs: {sorted(lost_may)}")
        elif lost_may:
            sample = sorted(lost_may)[:15]
            print(f"      示例 IDs: {sample} ... (共 {len(lost_may)} 笔)")

        print(f"    c168 有、127 无 (c168 新增): {len(only_new_may)} 笔")
        if only_new_may and len(only_new_may) <= 30:
            print(f"      IDs: {sorted(only_new_may)}")

        # backup can recover?
        recoverable = lost_may & old_data["backup_tx_ids_may"]
        print(f"    丢失交易中可从 127 transactions_backup 补回: {len(recoverable)} 笔")
        not_in_backup = lost_may - old_data["backup_tx_ids_may"]
        if not_in_backup:
            print(f"    丢失且 backup 也无: {len(not_in_backup)} 笔")

    elif old_ids and not new_ids:
        print(f"\n  5月 transactions (仅 127): {len(old_data['tx_ids_may'])} 笔 live")
        print(f"  5月 transactions_backup (仅 127): {len(old_data['backup_tx_ids_may'])} 笔 unique")
        print(f"  >>> 恢复策略: 全部从 127_0_0_1.sql 提取")


def main():
    print("=" * 60)
    print("  备份对比: c168site = 完整源库, c168 (2) = 待补全目标库")
    print(f"  日期范围 (交易类): {D_FROM} ~ {D_TO}")
    print(f"  旧备份: {OLD[1]}")
    print(f"  新备份: {NEW[1]}")
    print("=" * 60)

    for code in ("CX", "GP"):
        compare_company(code)

    print(f"\n{'=' * 60}")
    print("  结论")
    print(f"{'=' * 60}")
    print("  • 合并规则: c168 较新优先；缺失从 c168site + transactions_backup 补")
    print("  • 运行: python extract_cx_gp_merged.py --from-date 2026-05-01 --to-date 2026-05-31")
    print("  • transactions_deleted 不写入恢复脚本")


if __name__ == "__main__":
    main()

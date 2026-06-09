# Bank Process：Frequency = Week（按周计费）

本文档复述 **Week** 频率的完整业务规则与 PHP 实现要点，适用于：

- **PHP 页面**作为 Bank Process 列表 / Add·Edit Process / Accounting Due 前端
- **PHP API**（`api/processes/`、`api/bankprocess_maintenance/` 等）作为后端

与 Monthly、1st of Every Month、Once 并列，Week 为第四种 `day_start_frequency`。

---

## 1. 业务规则摘要

| 项目 | 规则 |
|------|------|
| 含义 | 以 **Day start** 为第一期起点，每期 **7 天**（含首尾）；**下一期起点 = 上一期结束日**（连续滚动，无间隔） |
| 入列时机 | 非 Resend：**今天 ≥ 该周结束日** 才进入 Accounting Due（未结束的周不出现） |
| 表单选项顺序 | `1st_of_every_month` → `monthly` → **`week`** → `once` |
| Day end | **不必填**；选 Week 时前端应 **禁用** 并提交空值 |
| Contract | **不必填**；选 Week 时前端应 **禁用** 并提交空值 |
| 金额 | 每期按 Process 上配置的 **整周全额**（Buy / Sell / Profit），不按天比例折算 |
| 当月过滤 | 与其他 frequency 一致：只展示与 **当前自然月** 有日期重叠的周期 |
| 跨月周期 | 若一周跨越两月（例：5/27–6/2），只要与 **当前月** 有交集，**整笔周期仍计入** |
| 纯历史月 | 若整段周期完全落在当前月之前（例：5/20–5/26，当前为 6 月），**不计入** |

### 1.1 示例 A（Day start = 5 月 28 日，今天 = 6 月 9 日，第一期已入账）

| 期次 | 区间 | 何时进 Accounting Due |
|------|------|------------------------|
| 第 1 期 | 5/28 – 6/3 | 6/3 当天起（结束日已到） |
| 第 2 期 | **6/3 – 6/9** | **6/9 当天起**（今天应出现这笔） |
| 第 3 期 | 6/9 – 6/15 | **6/15 起**才出现（今天 6/9 不应出现） |

说明：第二期起点是 **6/3**（= 第一期结束日），**不是** 6/4；错误算法 `day_start + 7n` 会得到 6/4–6/10，在 6/9 会误把未结束的周算进来。

### 1.2 示例 B（Day start = 6 月 1 日，今天 = 6 月 9 日）

- 第一期：**6/1 – 6/7**，6/7 起可入列
- 第二期：**6/7 – 6/13**，须到 **6/13** 才入列；6/9 当天只列最早一笔未结清（若第一期已入账则仍等第二期结束）

---

## 2. 数据库与存储

### 2.1 字段

表 `bank_process`（需已有 `day_start_frequency` 列）：

| 字段 | Week 时的值 |
|------|-------------|
| `day_start_frequency` | `week` |
| `day_start` | 必填，周期锚点（`Y-m-d` 或 `d/m/Y`） |
| `day_end` | `NULL` 或空 |
| `contract` | 空字符串 |

### 2.2 入账去重表 `process_accounting_posted`

| 字段 | Week 说明 |
|------|-----------|
| `period_type` | `weekly`（入账）或 `weekly_skipped`（从 Due 删除/跳过） |
| `posted_date` | **该周周期起点** `Y-m-d`（与 `weekly_billing_start` 一致） |

---

## 3. PHP 前端（页面 / JS）应实现的行为

### 3.1 Add / Edit Process 表单

1. **Frequency 下拉**增加选项（放在 Monthly 后面）：

```html
<option value="1st_of_every_month">1st of Every Month</option>
<option value="monthly">Monthly</option>
<option value="week">Week</option>
<option value="once">Once</option>
```

2. 当 `day_start_frequency === 'week'` 时：

   - **禁用** `#bank_day_end`（Day end）
   - **禁用** `#bank_contract`（Contract）
   - 切换到 Week 时清空 `day_end`、`contract`（Insurance 仍可填）
   - **不要求** Contract 校验（与 Once 类似，但 Week 不禁用 Insurance）

3. 提交 Add / Update 时：

   - `day_start_frequency` 传 `week`
   - `day_end`、`contract` 传空字符串

```javascript
// 伪代码：提交前
if (frequency === 'week') {
  formData.set('day_end', '');
  formData.set('contract', '');
}
```

### 3.2 Resend 弹窗

- Frequency 下拉同样包含 `week`
- Week / Monthly / Once：**禁用 Day end**，提交时 `day_end: null`
- 请求 `resend_accounting_due_api.php` 时 `day_start_frequency` 可为 `week`

### 3.3 Accounting Due 弹窗

从 Inbox API 拿到行后，入账 / 删除须带 **period_type** 与 **billing 锚点**：

```javascript
// 推断 period_type（与 React bankProcessHelpers.accountingDuePeriodType 一致）
function accountingDuePeriodType(row) {
  if (row.is_once_one_off) return 'once_one_off';
  if (row.is_weekly) return 'weekly';
  if (row.is_manual_inactive) return 'manual_inactive';
  if (row.is_resend_consolidated_range) return 'resend_consolidated_range';
  if (row.is_partial_first_month) return 'partial_first_month';
  if (row.is_day_end_tail) return 'day_end_tail';
  return 'monthly';
}

// billing_months[]：Week 传周期起点 Y-m-d
function accountingDueBillingMonth(row) {
  return (row.weekly_billing_start || row.monthly_billing_month || '').trim();
}
```

入账 POST 示例字段：

```
ids[]           = process id
period_types[]  = weekly
billing_months[] = 2026-06-01   // 该周起点，不是 Y-n 自然月格式
```

---

## 4. API 端点一览

| 用途 | 文件 | Week 相关要点 |
|------|------|----------------|
| 新增 Process | `api/processes/addprocess_api.php` | 允许 `week`；强制清空 `day_end`；清空 `contract` |
| 更新 Process | `api/processes/processlist_api.php?action=update_process` | 同上 |
| Accounting Due 列表 | `api/processes/process_accounting_inbox_api.php` | 核心排队逻辑；返回 `is_weekly`、`weekly_billing_start` |
| 入账 Transaction | `api/processes/process_post_to_transaction_api.php` | `period_type=weekly`；`billing_months[]=Y-m-d` |
| 从 Due 删除 | `api/processes/dismiss_accounting_due_api.php` | 写入 `weekly_skipped`；`posted_date` = 周期起点 |
| Resend | `api/bankprocess_maintenance/resend_accounting_due_api.php` | 允许 `week`；`day_end` 置 null |
| Payment History 描述 | `api/transactions/bank_process_bill_display.php` | `bankProcessWeeklyHistoryDescription()` |
| History 展示 | `api/transactions/history_api.php` | `period_type === 'weekly'` 时用 WEEK 文案 |

---

## 5. Accounting Due 排队逻辑（`process_accounting_inbox_api.php`）

### 5.1 周期计算（`contract_billing_addon.php`）

```php
// 单期：起点 due，终点 due + 6 天（含首尾 7 日）
weekPeriodEndInclusiveYmd('2026-05-28'); // → 2026-06-03

// 下一期起点 = 本期结束日（非 day_start + 7n）
weekPeriodNextStartYmd('2026-05-28');    // → 2026-06-03
weekPeriodEndInclusiveYmd('2026-06-03'); // → 2026-06-09

// 是否可入 Accounting Due（非 Resend）
weekPeriodIsReadyForAccounting('2026-06-03', '2026-06-09', false); // true（结束日=今天）
weekPeriodIsReadyForAccounting('2026-06-04', '2026-06-09', false); // 若误用 6/4 起点，结束 6/10，今天 false
```

从 `day_start` 起滚动：`next_start = previous_end`，直到 `period_end > today`（非 Resend）停止扫描。

### 5.2 是否进入 Due 列表（普通模式，非 Resend）

对每一期 `[due, periodEnd]` 依次判断：

1. `today >= day_start`（流程已开始）
2. **`today >= period_end`**（该周已结束；`weekPeriodIsReadyForAccounting`）
3. **与当前自然月有重叠**：`weekPeriodOverlapsCalendarMonth(due, periodEnd, todayYear, todayMonth)`
4. **创建日门槛**（与 Monthly 类似）：
   - 若 `due < createdYmd`（`dts_created` 的日期）
   - 仅当该周与 **创建日所在自然月** 仍有重叠时才保留；否则跳过（旧数据不拿）
5. 该期尚未入账/跳过：`hasWeeklyPostedForPeriodStart()` 查 `weekly` / `weekly_skipped`

满足条件后，**非 Resend 多期模式**只取 **最早一笔未结清** 写入 `needToday`。

### 5.3 跨月示例

| 周期 | 今天 | 是否入列（6 月） |
|------|------|------------------|
| 5/27 – 6/2 | 6/9 | 是（与 6 月重叠） |
| 5/20 – 5/26 | 6/9 | 否（全在 5 月） |
| 6/1 – 6/7 | 6/9 | 是 |

### 5.4 Inbox 返回 JSON 行结构（Week）

```json
{
  "id": 532,
  "name": "TEST",
  "bank": "PBB",
  "country": "MYR",
  "day_start": "2026-06-01",
  "contract": "WEEK",
  "cost": "200",
  "price": "400",
  "profit": "125",
  "already_posted_today": false,
  "is_partial_first_month": false,
  "is_manual_inactive": false,
  "is_weekly": true,
  "weekly_billing_start": "2026-06-01",
  "monthly_billing_month": "2026-06-01"
}
```

说明：

- `contract` 展示为 **`WEEK`**（非数据库 contract 字段）
- `monthly_billing_month` 在 Week 行中 **复用为周期起点 `Y-m-d`**，供前端统一传 `billing_months[]`
- 前端务必用 `is_weekly` 识别，**不要**仅用 `monthly_billing_month` 当自然月 `Y-n` 解析

### 5.5 Resend 模式

- `accounting_resend_relax_created_floor = 1` 且非单期：可列出多笔未结清周账单（`resendMulti`）
- 单期 Resend：仅列 `day_start` 对应那一期

### 5.6 已入账标记

`markAlreadyPostedOnNeedToday()` 对 `is_weekly === true` 的行调用 `hasWeeklyPostedForPeriodStart()`，**不会**误用 monthly 的「按自然月」判断。

---

## 6. 入账逻辑（`process_post_to_transaction_api.php`）

### 6.1 请求参数

```
POST process_post_to_transaction_api.php
ids[]            = 532
period_types[]   = weekly
billing_months[] = 2026-06-01
allow_future_monthly = 1   // 可选，与 monthly 共用开关
```

### 6.2 金额与日期

- **金额**：Process 上的 cost / price / profit **全额**（无 proration）
- `transaction_date` = 周期起点（`billing_months[]` 或 `day_start`）
- `process_accounting_posted.posted_date` = 同上（去重锚点）
- `source_bank_process_period_type` = `weekly`（若 transactions 表有该列）

### 6.3 去重 key

```
process_id + weekly + billing_month(YYYY-MM-DD)
```

---

## 7. 从 Due 删除（`dismiss_accounting_due_api.php`）

- `period_types[]` = `weekly`
- `billing_months[]` = 周期起点 `Y-m-d`
- 写入 `process_accounting_posted`：`period_type = weekly_skipped`，`posted_date` = 周期起点

---

## 8. Payment History 描述（`bank_process_bill_display.php`）

`period_type === 'weekly'` 时：

```
WEEK (01/06/2026 - 07/06/2026) @ <对应账户金额>
```

- Supplier：@ Buy
- Customer：@ Sell（绝对值展示）
- Company / Profit sharing：@ 对应分摊

---

## 9. 实现注意事项（PHP 维护者必读）

### 9.1 勿在 inbox API 中 require `billing_schedule.php`

`process_accounting_inbox_api.php` **已自带** `getBillingTermMonthsFromContract()` 等函数。若再 `require_once billing_schedule.php`，会因 **函数重复声明** 导致 Fatal error。

Week 周期工具函数在 **`contract_billing_addon.php`**（inbox / post 已 require）：

- `weekPeriodEndInclusiveYmd()`
- `weekPeriodNextStartYmd()`
- `weekPeriodIsReadyForAccounting()`

Inbox 内保留：`weekPeriodOverlapsCalendarMonth()`、`hasWeeklyPostedForPeriodStart()`、`inboxAppendWeeklyNeedToday()`

`billing_schedule.php` 中的同名 Week 函数仅作参考/其他模块复用，**不要**被 inbox 再次引入。

### 9.2 日期解析

`day_start` 须走 `bmp_bankProcessDateFieldToYmd()`（优先 `d/m/Y`），避免 `01/06/2026` 被 `strtotime` 当成美式 1 月 6 日。

### 9.3 period_type 合法值扩展

除原有类型外，入账 / 跳过链路须识别：

| 类型 | 含义 |
|------|------|
| `weekly` | 周账单入账 |
| `weekly_skipped` | 从 Due 移除，不再展示 |

涉及文件：`process_post_to_transaction_api.php`、`dismiss_accounting_due_api.php`、`maintenance_accounting_resend_lib.php`（`bmp_normalizePeriodType`）。

### 9.4 Inbox 去重

`needToday` 去重时 Week 行须：

- `typeOf` → `weekly`（勿与 `monthly` 混用）
- `normalizeBm` → 使用 `weekly_billing_start` 的 `Y-m-d`
- fingerprint 含 `weekly_billing_start`，避免多周被合并成一行

---

## 10. PHP 前端联调检查清单

- [ ] Frequency 下拉含 `week`，顺序在 monthly 之后
- [ ] 选 week 时 Day end、Contract 禁用且提交为空
- [ ] Add/Update API 返回成功，`bank_process.day_start_frequency = 'week'`
- [ ] GET Inbox 对「day_start=6/1、今天=6/9」返回 `is_weekly: true`，`weekly_billing_start: 2026-06-01`
- [ ] Transaction 提交 `period_types[]=weekly` + `billing_months[]=2026-06-01`
- [ ] 入账后 Inbox 该行消失；Payment History 为 `WEEK (dd/mm/yyyy - dd/mm/yyyy) @ ...`
- [ ] Delete from Due 写入 `weekly_skipped` 后不再出现
- [ ] Resend 可选 week，Day end 禁用

---

## 11. 相关源码路径（当前仓库）

| 模块 | 路径 |
|------|------|
| Inbox 主逻辑 | `api/processes/process_accounting_inbox_api.php` |
| 入账 | `api/processes/process_post_to_transaction_api.php` |
| 删除 Due | `api/processes/dismiss_accounting_due_api.php` |
| 新增 | `api/processes/addprocess_api.php` |
| 更新 | `api/processes/processlist_api.php` |
| Resend | `api/bankprocess_maintenance/resend_accounting_due_api.php` |
| 描述文案 | `api/transactions/bank_process_bill_display.php` |
| History | `api/transactions/history_api.php` |
| Resend 库 | `api/bankprocess_maintenance/maintenance_accounting_resend_lib.php` |
| React 参考实现（可选） | `frontend/src/pages/bankprocesslist/` |

---

## 12. 版本说明

- 功能：**Bank Process Frequency = Week**
- `day_start_frequency` 枚举扩展：`1st_of_every_month` | `monthly` | **`week`** | `once`
- 本文档描述与当前 `api/processes/process_accounting_inbox_api.php` 实现一致；若调整 Week 规则，请同步更新本文档与 PHP 前端 `period_types[]` / `billing_months[]` 传参约定。

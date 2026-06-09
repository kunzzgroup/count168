# Bank Process：Frequency = Day（按天计费）

本文档复述 **Day** 频率的完整业务规则与 PHP 实现要点，适用于：

- **PHP 页面**作为 Bank Process 列表 / Add·Edit Process / Accounting Due 前端
- **PHP API**（`api/processes/`、`api/bankprocess_maintenance/` 等）作为后端

与 Monthly、1st of Every Month、Week、Once 并列，Day 为第五种 `day_start_frequency`。

> 姊妹文档：[bank-process-week-frequency.md](./bank-process-week-frequency.md)（Week 按周计费）

---

## 1. 业务规则摘要

| 项目 | 规则 |
|------|------|
| 含义 | 以 **Day start** 为锚点，**每个自然日** 为一期；Process 上 Buy / Sell / Profit 为 **单日全额** |
| 当月过滤 | **上个月及更早不算**；只算 `max(day_start, 当月1号)` ～ **今天**（含今天） |
| 首次积压 / 补账 | 当月从计费起点起有 **连续多日** 未入账 → **合并成一笔** Due，**日期列显示今天**，金额为 `单日全额 × 天数` |
| 合并入账之后 | 仅余 **1 天** 未入账时 → **单日一笔**；`transaction_date` = 该天 |
| Resend（弹窗填了 `day_start`） | **单期**：只补弹窗指定 **那一天**；**不受「今天」上限**；入账后 **不回扫**库里原始 `day_start` |
| Resend（未指定单期 / 非 relax 单期） | 日常逻辑：当月积压仍可 **合并** 为一笔 |
| 表单选项顺序 | `1st_of_every_month` → `monthly` → `week` → **`day`** → `once` |
| Day end | **不必填**；选 Day 时前端应 **禁用** 并提交空值 |
| Contract | **不必填**；选 Day 时前端应 **禁用** 并提交空值 |
| 创建日 | **不按 `dts_created` 截断当月天数**（「当月之前不算」仅指跨自然月，不是创建日之前的天） |

### 1.1 示例 A（Day start = 5 月 28 日，今天 = 6 月 9 日）

| 计费区间 | 说明 |
|----------|------|
| 5/28 – 5/31 | **不计入**（落在当前月之前） |
| **6/1 – 6/9** | 共 9 天；Due **合并 1 笔**，日期列 **09/06/2026**，Buy = `10 × 9 = 90` |

### 1.2 示例 B（Day start = 6 月 1 日，今天 = 6 月 9 日，首次入账）

| 阶段 | Accounting Due | 入账后 History |
|------|----------------|----------------|
| 打开 Due | **1 行**：`start_date = 09/06/2026`，金额 9 天合计 | — |
| 入账 | `period_type = daily_consolidated`，`billing_months[] = 2026-06-01\|2026-06-09` | **1 条**：`DAY (01/06/2026 - 09/06/2026) @ 90`，流水日期 **09/06/2026** |
| 次日 6/10 | **1 行**：`start_date = 10/06/2026`，单日金额 | `DAY (10/06/2026) @ 10` |

### 1.3 示例 C（误操作后补账，禁止逐日八笔）

若 6/9 已误入账单日，仍缺 6/1–6/8：

| 错误行为（旧逻辑） | 正确行为（当前逻辑） |
|--------------------|----------------------|
| Due 每天 1 笔，History 出现 8 条 `DAY (01/06)…DAY (08/06)` | Due **仍合并 1 笔** 6/1–6/8，日期 **09/06/2026**，金额 `10 × 8 = 80` |

判断：未入账天数 `> 1` 且 **第一天 = effectiveStart**（`max(day_start, 当月1号)`）→ 合并。

### 1.4 示例 D（合并后漏账，不合并）

6/1–6/9 已合并入账；6/10、6/11 都未入，今天 6/12：

- 未入账 = `[6/10, 6/11]`，首日 `6/10 ≠ effectiveStart(6/1)` → **只列最早一天 6/10**（不合并）

### 1.5 Resend 单期（重要：只补指定一日，入账后不回扫原始 day_start）

**业务要求**：Resend 弹窗选 Day 并填某日（如 **6/16**）→ 只补 **该自然日**；**不必是今天**；入账后结束，**不得**立刻按库里真实 `day_start` 从当月 1 号补历史天。

| 场景 | 库里真实 `day_start` | Resend 弹窗 | 今天 | Resend 期间 Due | 入账后 Due（正确） |
|------|----------------------|-------------|------|-----------------|-------------------|
| 补 6/16 单日 | 6/1 | 6/16，Frequency=Day | 6/9 | **1 行**：`start_date = 16/06/2026`，单日全额 | **空**（不出现 6/1–6/15 积压） |
| 误期行为（已修复前） | 6/1 | 6/16 | 6/9 | Due **空**（`effectiveEnd=today` 且 6/16>今天） | 或入账后又从 6/1 合并补账 |

弹窗 `day_start` / `frequency` **不写入** `bank_process`（与 Edit Process 分离）；relax 期间由暂存列覆盖计算。

---

## 2. 数据库与存储

### 2.1 字段

表 `bank_process`（需已有 `day_start_frequency` 列）：

| 字段 | Day 时的值 |
|------|------------|
| `day_start_frequency` | `day` |
| `day_start` | 必填，计费锚点（`Y-m-d` 或 `d/m/Y`） |
| `day_end` | `NULL` 或空 |
| `contract` | 空字符串 |

### 2.2 入账去重表 `process_accounting_posted`

Day 使用 **按自然日** 的去重，而非按合并展示日：

| 场景 | `period_type` | `posted_date` |
|------|---------------|---------------|
| 单日入账 | `daily` | 该自然日 `Y-m-d` |
| 从 Due 删除（单日） | `daily_skipped` | 该自然日 `Y-m-d` |
| **合并入账** | 对区间内 **每一天** 各写一条 `daily` | 各自然日 `Y-m-d`（非今天） |
| 从 Due 删除（合并） | 对区间内每一天写 `daily_skipped` | 各自然日 `Y-m-d` |

说明：合并账在 **Transaction** 只有 **1 条**（`transaction_date = 今天`），但 PAP 按天标记，防止重复入列。

`transactions.source_bank_process_period_type`（若有该列）：

| 入账类型 | 值 |
|----------|-----|
| 单日 | `daily` |
| 合并 | `daily_consolidated` |

---

## 3. PHP 前端（页面 / JS）应实现的行为

### 3.1 Add / Edit Process 表单

1. **Frequency 下拉**增加选项（放在 Week 后面、Once 前面）：

```html
<option value="1st_of_every_month">1st of Every Month</option>
<option value="monthly">Monthly</option>
<option value="week">Week</option>
<option value="day">Day</option>
<option value="once">Once</option>
```

2. 当 `day_start_frequency === 'day'` 时（与 Week 相同）：

   - **禁用** `#bank_day_end`（Day end）
   - **禁用** `#bank_contract`（Contract）
   - 切换到 Day 时清空 `day_end`、`contract`（Insurance 仍可填）
   - **不要求** Contract 校验

3. 提交 Add / Update 时：

```javascript
if (frequency === 'day') {
  formData.set('day_end', '');
  formData.set('contract', '');
  formData.set('day_start_frequency', 'day');
}
```

### 3.2 Resend 弹窗

- Frequency 下拉包含 `day`（在 `week` 之后）
- Day / Week / Monthly / Once：**禁用 Day end**，提交时 `day_end: null`
- 请求 `resend_accounting_due_api.php` 时 `day_start_frequency` 可为 `day`
- **单期 Resend**（弹窗填了 `day_start`）：Due **只 1 行**、对应该自然日；**不要求**该日 ≤ 今天
- 弹窗参数仅本次 Resend 有效，**不 UPDATE** `bank_process` 持久字段

### 3.3 Accounting Due 弹窗

从 Inbox API 拿到行后，入账 / 删除须带 **period_type** 与 **billing 锚点**：

```javascript
function accountingDuePeriodType(row) {
  if (row.is_once_one_off) return 'once_one_off';
  if (row.is_weekly) return 'weekly';
  if (row.is_daily && row.is_daily_consolidated) return 'daily_consolidated';
  if (row.is_daily) return 'daily';
  if (row.is_manual_inactive) return 'manual_inactive';
  if (row.is_resend_consolidated_range) return 'resend_consolidated_range';
  if (row.is_partial_first_month) return 'partial_first_month';
  if (row.is_day_end_tail) return 'day_end_tail';
  return 'monthly';
}

function accountingDueBillingMonth(row) {
  if (row.is_daily || row.is_daily_consolidated) {
    return String(row.monthly_billing_month || row.daily_billing_start || '').trim();
  }
  return String(row.weekly_billing_start || row.monthly_billing_month || '').trim();
}
```

**Due 列表日期列**：优先用 `row.start_date`（Inbox 已格式化 `d/m/Y`）：

- 合并行：`start_date` = **今天**
- 单日行：`start_date` = **该账单日**

入账 POST 示例：

```
# 合并（6/1–6/9）
ids[]            = 532
period_types[]   = daily_consolidated
billing_months[] = 2026-06-01|2026-06-09

# 单日（6/10）
ids[]            = 532
period_types[]   = daily
billing_months[] = 2026-06-10
```

---

## 4. API 端点一览

| 用途 | 文件 | Day 相关要点 |
|------|------|----------------|
| 新增 Process | `api/processes/addprocess_api.php` | 允许 `day`；强制清空 `day_end`；清空 `contract` |
| 更新 Process | `api/processes/processlist_api.php?action=update_process` | 同上 |
| Accounting Due 列表 | `api/processes/process_accounting_inbox_api.php` | 核心排队；返回 `is_daily`、`is_daily_consolidated`、`daily_billing_start/end`、`start_date` |
| 周期工具 | `api/processes/contract_billing_addon.php` | `dailyNextDayYmd`、`dailyAmountsForDayCount`、`dailyParseConsolidatedBillingRange` 等 |
| 入账 Transaction | `api/processes/process_post_to_transaction_api.php` | `daily` / `daily_consolidated`；**Daily Resend 单期入账后**写 `daily_skipped` 抑制历史 backlog（见 §5.5、§6.4） |
| 从 Due 删除 | `api/processes/dismiss_accounting_due_api.php` | 合并删除时对区间每天写 `daily_skipped` |
| Resend | `api/bankprocess_maintenance/resend_accounting_due_api.php` | 允许 `day`；`day_end` 置 null；**Day 时只删** `posted_date = 弹窗 day_start` 的 `daily` / `daily_skipped` |
| Resend 库 | `api/bankprocess_maintenance/maintenance_accounting_resend_lib.php` | `bmp_normalizePeriodType` 识别 `daily` / `daily_consolidated` |
| Payment History 描述 | `api/transactions/bank_process_bill_display.php` | `bankProcessDailyHistoryDescription()` |
| History 展示 | `api/transactions/history_api.php` | `period_type === 'daily'` 或 `daily_consolidated` 时用 DAY 文案 |

---

## 5. Accounting Due 排队逻辑（`process_accounting_inbox_api.php`）

### 5.1 计费窗口

```php
$monthFirst      = calendarMonthFirstYmd($todayYear, $todayMonth); // 例：2026-06-01
$effectiveStart  = max($startDate, $monthFirst);                   // 例：max(2026-06-01, 2026-06-01)
$effectiveEnd    = $today;                                         // 例：2026-06-09

$unpostedDays = dailyCollectUnpostedDaysInRange($pdo, $companyId, $processId, $effectiveStart, $effectiveEnd);
// 返回 [2026-06-01, 2026-06-02, …, 2026-06-09]（尚未有 daily / daily_skipped PAP 的日期）
```

**注意**：`dailyCollectUnpostedDaysInRange` **不使用** `dts_created` 过滤；跨月截断仅由 `effectiveStart` 保证。

### 5.2 合并 vs 单日（日常模式；单期 Resend 见 §5.5，不走本段）

```php
// 单期 Resend 已在前面 return：只 inboxAppendDailyNeedToday(弹窗日)
$forceConsolidated = $resendRelax && !$resendSinglePeriod; // relax 且非单期时可合并
$isCatchUpBatch    = count($unpostedDays) > 1 && $unpostedDays[0] === $effectiveStart;

if ($forceConsolidated || $isCatchUpBatch) {
    // 合并：金额 = dailyAmountsForDayCount($cost, $price, $profit, count($unpostedDays))
    // start_date = 今天（d/m/Y）
    // monthly_billing_month = "{rangeStart}|{rangeEnd}"
} else {
    // 单日：最早未入账日，金额 = Process 单日全额
}
```

### 5.3 Inbox 返回 JSON — 合并行

```json
{
  "id": 532,
  "name": "TEST 4",
  "bank": "PBB",
  "country": "MYR",
  "day_start": "01/06/2026",
  "contract": "DAY",
  "cost": "90.00",
  "price": "180.00",
  "profit": "81.00",
  "already_posted_today": false,
  "is_partial_first_month": false,
  "is_manual_inactive": false,
  "is_daily": true,
  "is_daily_consolidated": true,
  "daily_billing_start": "2026-06-01",
  "daily_billing_end": "2026-06-09",
  "monthly_billing_month": "2026-06-01|2026-06-09",
  "start_date": "09/06/2026"
}
```

### 5.4 Inbox 返回 JSON — 单日行

```json
{
  "id": 532,
  "contract": "DAY",
  "cost": "10.00",
  "price": "20.00",
  "profit": "9.00",
  "is_daily": true,
  "is_daily_consolidated": false,
  "daily_billing_start": "2026-06-10",
  "monthly_billing_month": "2026-06-10",
  "start_date": "10/06/2026"
}
```

说明：

- `contract` 展示为 **`DAY`**（非数据库 contract 字段）
- 务必用 `is_daily` / `is_daily_consolidated` 识别，**不要**把 `monthly_billing_month` 当自然月 `Y-n` 解析
- 合并行的 `monthly_billing_month` 格式为 **`start|end`**（`Y-m-d|Y-m-d`）

### 5.5 Resend 模式

#### 排队（Inbox）

当 `accounting_resend_single_period_from_schedule = 1` 且 `frequency = day`：

```php
// 只查弹窗锚点一日；不走 effectiveEnd = today，不 forceConsolidated
if (!hasDailyPostedOrSkippedForDay(..., $startDate)) {
    inboxAppendDailyNeedToday(..., $startDate, ...);
}
```

| 模式 | Due 行为 |
|------|----------|
| **单期 Resend**（弹窗填 `day_start`） | **1 行单日**；锚点 = 弹窗日；未来日也可出现 |
| 日常 / relax 非单期 | 仍用 `effectiveStart`～`today`；积压可 **合并** |

#### Resend 清除 posted（`resend_accounting_due_api.php`）

| frequency | 清除范围 |
|-----------|----------|
| `day` | **仅** `period_type IN ('daily','daily_skipped')` 且 `posted_date = 弹窗 day_start` |
| 其他（无 day_end 区间） | 弹窗 `day_start` **所在自然月** 的全部 posted |

#### Resend 单期入账后（`process_post_to_transaction_api.php`）

清 relax **之前**调用 `txnRecordDailySkippedBeforeResendAnchor()`：对「库里真实 `day_start` → Resend 锚点之前」每个尚无 `daily` / `daily_skipped` 的自然日写 **`daily_skipped`**。

**回归警示**：若 Inbox 仍用 `effectiveEnd = today`，Resend 未来日（如今天 6/9、补 6/16）会得到 **Due 空**；若入账后未写 `daily_skipped` 就清 relax，会从原始 `day_start` 再排出合并/单日 backlog。

### 5.6 已入账标记

`markAlreadyPostedOnNeedToday()`：

- **单日**：`hasDailyPostedOrSkippedForDay(processId, daily_billing_start)`
- **合并**：对 `dailyParseConsolidatedBillingRange(monthly_billing_month)` 区间内逐日检查；全部已有 PAP 则 `already_posted_today = true`

### 5.7 Inbox 去重

`needToday` 去重时 Day 行须：

- `typeOf` → `daily` 或 `daily_consolidated`
- `normalizeBm` → `daily|{billing_anchor}`（合并含 `|`）
- fingerprint 含 `dailyAnchor`（`monthly_billing_month`），避免不同区间被合并成一行

---

## 6. 入账逻辑（`process_post_to_transaction_api.php`）

### 6.1 请求参数

```
POST process_post_to_transaction_api.php

# 合并
ids[]            = 532
period_types[]   = daily_consolidated
billing_months[] = 2026-06-01|2026-06-09

# 单日
ids[]            = 532
period_types[]   = daily
billing_months[] = 2026-06-10
```

### 6.2 金额与日期

| 类型 | 金额 | `transaction_date` | PAP |
|------|------|-------------------|-----|
| `daily` | Process 单日全额 | `billing_months[]` 当日 | 1 条 `daily`，`posted_date` = 该日 |
| `daily_consolidated` | 单日全额 × `dailyInclusiveDayCount(start,end)` | **今天** | `recordDailyRangeAccountingPosted()`：区间内 **每天** 1 条 `daily` |

合并账描述后缀（供 History 解析区间）：

```
[DAILY_RANGE=2026-06-01|2026-06-09]
```

Profit Sharing：合并账按折算后 `profit` 与原始 `profit` 比例分摊（与 `resend_consolidated_range` 同类处理）。

### 6.3 去重 key

```
process_id + daily + billing_month(YYYY-MM-DD)
process_id + daily_consolidated + billing_month(YYYY-MM-DD|YYYY-MM-DD)
```

### 6.4 Daily Resend 单期入账后的 `daily_skipped`（必读）

触发条件：`period_type === 'daily'` + `accounting_resend_single_period_from_schedule` + `frequency === 'day'` + 清 relax 前。

```php
txnRecordDailySkippedBeforeResendAnchor(
    $pdo, $companyId, $processId,
    $storedDayStartYmd,   // bank_process_stored_day_start
    $resendAnchorYmd,     // billing_months[] / 弹窗 day_start
    $hasPeriodType
);
```

示例（库里 `day_start = 2026-06-01`，Resend `2026-06-16` 并入账，今天 = 6/9）：

| 自然日 | 入账后 PAP |
|--------|------------|
| 2026-06-01 … 2026-06-15 | `daily_skipped`（抑制 backlog） |
| 2026-06-16 | `daily`（本次 Resend 入账） |
| 2026-06-17 及以后 | 无；按正常 Day 规则待日到期后再入列 |

---

## 7. 从 Due 删除（`dismiss_accounting_due_api.php`）

| 前端 `period_types[]` | 行为 |
|----------------------|------|
| `daily` | 写 1 条 `daily_skipped`，`posted_date` = `billing_months[]` |
| `daily_consolidated` | 解析 `start\|end`，对区间内 **每一天** 写 `daily_skipped` |

---

## 8. Payment History 描述（`bank_process_bill_display.php`）

| `period_type` | 展示 |
|---------------|------|
| `daily` | `DAY (09/06/2026) @ <金额>` |
| `daily_consolidated` | `DAY (01/06/2026 - 09/06/2026) @ <金额>`（从 description 中 `[DAILY_RANGE=…]` 解析区间） |

- Supplier：@ Buy（`process_cost`）
- Customer：@ Sell（绝对值）
- Company / Profit sharing：@ 对应分摊

---

## 9. 实现注意事项（PHP 维护者必读）

### 9.1 勿在 inbox API 中 require `billing_schedule.php`

与 Week 相同：`process_accounting_inbox_api.php` 已 require `contract_billing_addon.php`。再引入 `billing_schedule.php` 可能 **函数重复声明** Fatal error。

Day 工具函数在 **`contract_billing_addon.php`**：

- `dailyNextDayYmd()`
- `calendarMonthFirstYmd()`
- `dailyAmountsForDayCount()`
- `dailyParseConsolidatedBillingRange()`
- `dailyInclusiveDayCount()`

Inbox 内保留：

- `hasDailyPostedOrSkippedForDay()`
- `dailyCollectUnpostedDaysInRange()`
- `inboxAppendDailyNeedToday()` / `inboxAppendDailyConsolidatedNeedToday()`

### 9.2 日期解析

`day_start` 须走 `inboxBankProcessDateFieldToYmd()` / `bmp_bankProcessDateFieldToYmd()`（优先 `d/m/Y`），避免 `01/06/2026` 被 `strtotime` 当成美式 1 月 6 日。

### 9.3 period_type 合法值扩展

| 类型 | 含义 |
|------|------|
| `daily` | 单日入账 |
| `daily_skipped` | 单日从 Due 移除 |
| `daily_consolidated` | 合并入账（Transaction 一条；PAP 按天） |

涉及文件：`process_post_to_transaction_api.php`、`dismiss_accounting_due_api.php`、`maintenance_accounting_resend_lib.php`（`bmp_normalizePeriodType`）。

### 9.4 常见错误（迁移时务必避免）

| 错误 | 后果 |
|------|------|
| 用 `dts_created` 截断当月未入账天数 | 只出现「今天」单日账，丢失 6/1–6/8 |
| 当月已有任意 daily PAP 就禁止合并 | 补账时被迫逐日多笔入账 |
| 合并入账只写 1 条 PAP（posted_date=今天） | 无法按天去重，重复入列 |
| 合并账 `transaction_date` 写成区间首日 | History 日期与「展示在今天」不符 |
| 前端传 `period_type=monthly` | 金额不按天累乘，逻辑错乱 |
| 把 `monthly_billing_month` 当 `Y-n` 自然月 | 合并锚点 `2026-06-01\|2026-06-09` 解析失败 |
| Resend 单期仍用 `effectiveEnd = today` | 弹窗未来日（6/16、今天 6/9）→ Due **空** |
| Resend 入账后未写 `daily_skipped` 就清 relax | 从库里 `day_start` 再排出 6/1–6/15 合并/单日 |

修改 `process_accounting_inbox_api.php`、`process_post_to_transaction_api.php`、`resend_accounting_due_api.php` 时，须用 §1.5 回归：**Resend 6/16（今天 6/9）→ Due 1 行 → 入账 → Due 空**。

---

## 10. PHP 前端联调检查清单

- [ ] Frequency 下拉含 `day`，顺序在 `week` 之后、`once` 之前
- [ ] 选 `day` 时 Day end、Contract 禁用且提交为空
- [ ] Add/Update 成功，`bank_process.day_start_frequency = 'day'`
- [ ] Inbox：`day_start=6/1`、今天 `6/9` → **1 行** `is_daily_consolidated: true`，`start_date: 09/06/2026`，`cost = 10×9`
- [ ] Transaction：`period_types[]=daily_consolidated`，`billing_months[]=2026-06-01|2026-06-09`
- [ ] 入账后 Inbox 该行消失；History **仅 1 条**：`DAY (01/06/2026 - 09/06/2026) @ 90`，日期 **09/06/2026**
- [ ] 次日仅 `6/10` 未入 → 1 行单日，`period_types[]=daily`，`billing_months[]=2026-06-10`
- [ ] Delete 合并行后，区间内每日均有 `daily_skipped`，不再出现
- [ ] Resend 可选 `day`，Day end 禁用
- [ ] **Resend Day 单期**：库里 `day_start=6/1`，弹窗 Resend `6/16`、今天 `6/9` → Due **1 行** `16/06/2026`
- [ ] **Resend Day 入账后**：Due **为空**，**不**再出现 6/1–6/15 合并或单日 backlog
- [ ] **Resend Day 清除**：只删 `posted_date=6/16` 的 daily 记录，同月其他天 **保留**（若曾入账）
- [ ] `process_accounting_posted` 中早于 Resend 锚点的自然日存在 `daily_skipped`（入账后检查）

---

## 11. 相关源码路径（当前仓库）

| 模块 | 路径 |
|------|------|
| Inbox 主逻辑 | `api/processes/process_accounting_inbox_api.php` |
| 周期 / 金额工具 | `api/processes/contract_billing_addon.php` |
| 入账 | `api/processes/process_post_to_transaction_api.php` |
| 删除 Due | `api/processes/dismiss_accounting_due_api.php` |
| 新增 | `api/processes/addprocess_api.php` |
| 更新 | `api/processes/processlist_api.php` |
| Resend | `api/bankprocess_maintenance/resend_accounting_due_api.php` |
| 描述文案 | `api/transactions/bank_process_bill_display.php` |
| History | `api/transactions/history_api.php` |
| Resend 库 | `api/bankprocess_maintenance/maintenance_accounting_resend_lib.php` |
| React 参考实现 | `frontend/src/pages/bankprocesslist/`（`bankProcessHelpers.js`、`BankProcessFormModal.jsx`、`ResendModal.jsx`） |

---

## 12. 与 Week 的差异速查

| | Week | Day |
|---|------|-----|
| 周期 | 7 天 | 1 天 |
| 金额 | 整周全额 | 单日全额（合并时 × 天数） |
| Due 多行（非 Resend） | 最早未结清 **一周** | 合并 **或** 最早 **一天** |
| Resend 单期 | 只列弹窗那一周 | **只列弹窗那一日**（单日，非合并） |
| Resend 非单期 / 日常积压 | 可多周多行 | 当月未入账天可 **合并** |
| `billing_months[]` | 周期起点 `Y-m-d` | 单日 `Y-m-d`；合并 `start\|end` |
| Due 日期列 | 周起点 | 合并=**今天**；单日=账单日 |
| PAP `posted_date` | 周起点 | **每个自然日** |

---

## 13. 版本说明

- 功能：**Bank Process Frequency = Day**
- `day_start_frequency` 枚举：`1st_of_every_month` | `monthly` | `week` | **`day`** | `once`
- **2026-06**：修复 Daily Resend 单期——Inbox 只列弹窗指定日（不受今天限制）；Resend 清除按日精确删；入账后写 `daily_skipped` 抑制回扫原始 `day_start`（§1.5、§5.5、§6.4）
- 本文档与当前 `process_accounting_inbox_api.php`、`process_post_to_transaction_api.php`、`resend_accounting_due_api.php` 实现一致（含日常合并补账 `isCatchUpBatch` 规则）
- 若调整 Day / Resend 规则，请同步更新本文档与 PHP 前端 `period_types[]` / `billing_months[]` 传参约定

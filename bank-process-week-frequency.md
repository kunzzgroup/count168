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

### 1.3 Resend 单期（重要：只补指定一周，入账后不回扫原始 day_start）

**业务要求**：Resend 仅对弹窗指定的那一周生效；入账完成后 **不得** 立刻按 Process **库里真实** `day_start` 从头补历史 backlog。

| 场景 | 库里真实 `day_start` | Resend 弹窗 `day_start` | Resend 期间 Due | 入账后 Due（正确） |
|------|----------------------|-------------------------|-----------------|-------------------|
| 补 6/15 那一周 | 5/27 | 6/15，Frequency=Week | 只显示 **6/15 – 6/21** 一行 | **空**（不出现 5/27、6/2 等历史周） |
| 误期行为（已修复前） | 5/27 | 6/15 | 只显示 6/15 一行 | 入账后又冒出 **5/27** 等最早未结清周 |

标准周锚点由 **库里** `day_start` 滚动（5/27 → 6/2 → 6/8 → 6/14 → 6/20 …）。弹窗填 **6/15** 可能与标准锚点不一致；Resend 仍只开 **6/15–6/21** 单期，入账后须把 **早于 6/15 的标准周** 标为 `weekly_skipped`，再清除 `accounting_resend_relax_created_floor`。

**「Posted 3 transaction record(s)」**：通常表示 **1 张周账单** 生成 3 条分录（cost / price / profit），**不是** 3 张账单。

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
- 弹窗中的 `day_start` / `frequency` **仅本次 Resend 有效**，**不写入** `bank_process`（Edit Process 仍用库里字段）
- **用户预期**：选 Week 并填某日（如 6/15）→ Accounting Due **只出现该周** → 入账后 **结束**，不要自动再出现库里最早 `day_start`（如 5/27）的历史周
- **建议（可选增强）**：Week Resend 时可将弹窗日期 **对齐到标准周起点**（由库里 `day_start` 滚动得出），减少「6/15 与标准 6/14 锚点不一致」的困惑；当前后端允许任意日期，靠入账后 `weekly_skipped` 抑制 backlog

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
| 入账 Transaction | `api/processes/process_post_to_transaction_api.php` | `period_type=weekly`；`billing_months[]=Y-m-d`；**Weekly Resend 单期入账后**写 `weekly_skipped` 抑制历史 backlog（见 §5.5、§6.4） |
| 从 Due 删除 | `api/processes/dismiss_accounting_due_api.php` | 写入 `weekly_skipped`；`posted_date` = 周期起点 |
| Resend | `api/bankprocess_maintenance/resend_accounting_due_api.php` | 允许 `week`；`day_end` 置 null；**Week 时只删** `posted_date = 弹窗 day_start` 的 `weekly` / `weekly_skipped`（不按整月删） |
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

#### 排队（Inbox）

- `accounting_resend_relax_created_floor = 1` 且非单期：可列出多笔未结清周账单（`resendMulti`）
- **单期 Resend**（弹窗填了 `day_start` → `accounting_resend_single_period_from_schedule = 1`）：仅列弹窗锚点那一期；`day_start` 在 relax 期间由暂存列覆盖，**不改**库里持久字段

#### Resend 清除 posted（`resend_accounting_due_api.php`）

| frequency | 清除范围 |
|-----------|----------|
| `week` | **仅** `period_type IN ('weekly','weekly_skipped')` 且 `posted_date = 弹窗 day_start` |
| 其他（无 day_end 区间） | 弹窗 `day_start` **所在自然月** 的全部 posted（含 `partial_first_month` 等） |

**勿**对 Week 使用「按整月 DELETE」——会误删同月其他已入账周（如 Resend 6/15 时删掉 6/2、6/8 的记录）。

#### Resend 单期入账后（`process_post_to_transaction_api.php`）

入账成功、**清除 relax 之前**，须执行（与 monthly `partial_first_month_skipped` 同理）：

1. 取 `bank_process_stored_day_start`（库里真实锚点，如 5/27）
2. 取 Resend 锚点 = `billing_months[]` / 弹窗 `day_start`（如 6/15）
3. 从 (1) 按 `weekPeriodNextStartYmd` 滚动，对每个 `due < Resend 锚点` 且尚无 `weekly` / `weekly_skipped` 的标准周，写入 **`weekly_skipped`**（`posted_date = due`）
4. 再 `UPDATE bank_process SET accounting_resend_relax_created_floor = 0, ...`

实现函数：`txnRecordWeeklySkippedBeforeResendAnchor()`、`txnIsWeeklyPostedOrSkippedForPeriodStart()`。

**回归警示**：若删除或跳过步骤 3 就清 relax，Inbox 会立刻用库里 `day_start` 扫描，**最早未结清周**（如 5/27）会再次进入 Accounting Due。

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

### 6.4 Weekly Resend 单期入账后的 `weekly_skipped`（必读）

触发条件同时满足：

- `period_type === 'weekly'`
- `accounting_resend_single_period_from_schedule` 非空
- `day_start_frequency === 'week'`
- `accounting_resend_relax_created_floor === 1`（入账循环内，清 relax 前）

伪代码：

```php
// 清 relax 之前调用
txnRecordWeeklySkippedBeforeResendAnchor(
    $pdo, $companyId, $processId,
    $storedDayStartYmd,   // bank_process_stored_day_start
    $resendAnchorYmd,    // billing_months[] 或弹窗 day_start
    $hasPeriodType
);
// 然后才 UPDATE ... accounting_resend_relax_created_floor = 0
```

示例（库里 `day_start = 2026-05-27`，Resend `2026-06-15` 并入账）：

| 标准周起点 `due` | 入账后 `process_accounting_posted` |
|----------------|-----------------------------------|
| 2026-05-27 | `weekly_skipped`（抑制 backlog） |
| 2026-06-02 | `weekly_skipped` |
| 2026-06-08 | `weekly_skipped` |
| 2026-06-14 | `weekly_skipped` |
| 2026-06-15 | `weekly`（本次 Resend 入账） |
| 2026-06-20 及以后 | 无记录；按正常 Week 规则待周期结束后再入列 |

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

### 9.5 Weekly Resend：易错点与勿回归清单

| 易错点 | 后果 | 正确做法 |
|--------|------|----------|
| Resend 入账后 **先** 清 `accounting_resend_relax_created_floor`，**未** 写 `weekly_skipped` | Due 立刻出现库里最早未结清周（如 5/27） | 先 `txnRecordWeeklySkippedBeforeResendAnchor`，再清 relax |
| Week Resend 按 **自然月** 删 `process_accounting_posted` | 同月其他周被误删，或该删的未删 | `frequency=week` 时按 `posted_date = 弹窗 day_start` 精确删 |
| 以为「Posted 3 条」= 3 张账单 | 误判为重复入账 | 1 周账单 = 最多 3 条 transaction（cost/price/profit 等） |
| Accounting Due 列表 **START DATE** 只看 `day_start` | Resend 后显示库里 5/27 而非本周锚点 | Week 行应用 `weekly_billing_start` 展示（前端可选增强） |
| 弹窗 `day_start` 与标准周锚点不一致（如填 6/15，标准为 6/14） | 用户困惑；依赖入账后 skip 抑制标准 6/14 行 | 文档说明 + 可选前端对齐标准锚点 |

修改 `process_post_to_transaction_api.php`、`resend_accounting_due_api.php` 或 `maintenance_accounting_resend_lib.php` 时，须用 §1.3 示例回归：**Resend 6/15 → 入账 → Due 为空**。

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
- [ ] **Resend Week**：库里 `day_start=5/27`，弹窗 Resend `6/15` → Due **仅** 6/15 一行
- [ ] **Resend Week 入账后**：Due **为空**，**不**再出现 5/27 / 6/2 等历史周
- [ ] **Resend Week 清除**：只删 `posted_date=6/15` 的 weekly 记录，同月 6/2、6/8 等 **保留**（若曾入账）
- [ ] `process_accounting_posted` 中早于 Resend 锚点的标准周存在 `weekly_skipped`（入账后检查）

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
- **2026-06**：修复 Weekly Resend 单期入账后回扫库里原始 `day_start` 导致多出历史周的问题；Resend 清除改为按周锚点精确删；入账后写 `weekly_skipped`（§1.3、§5.5、§6.4、§9.5）
- 本文档描述与当前 `process_accounting_inbox_api.php`、`process_post_to_transaction_api.php`、`resend_accounting_due_api.php` 实现一致；若调整 Week / Resend 规则，请同步更新本文档与 PHP 前端 `period_types[]` / `billing_months[]` 传参约定。

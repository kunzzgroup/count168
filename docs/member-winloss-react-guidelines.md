# Member Win/Loss 頁 — React 遷移指南（Guidelines）

本文整理 `member.php`、`js/member.js`、`css/member.css` 中 **Win/Loss 儀表頂部區**（篩選 + 迷你帳戶×幣別矩陣 + Total + 關聯帳號 Modal）的 **功能設計、版面規則、狀態與 API**，供 React 版對齊實作。

---

## 1. 頁面骨架與全域設定

### 1.1 Body / 容器 class

- `body`: `transaction-page member-winloss-page`
- 主內容：`transaction-container` → 標題 → `transaction-main-content member-winloss-dash`
- 頂部白卡：`transaction-search-section member-dash-unified-bar`（內含 `member-dash-columns`）

### 1.2 PHP 注入到前端的設定（`member.php` 內 `<script>`）

| 變數 | 用途 |
|------|------|
| `MEMBER_LINKED_ROOT_ACCOUNT_ID` | 拉「關聯帳號」列表、迷你網格帳號列的根 id（**登入帳號** db id），避免切換檢視帳號後網格只剩單一帳號 |
| `MEMBER_ACCOUNT_ID` | 當前 Win/Loss **檢視**帳本 id（summary / 明細表） |
| `MEMBER_ACCOUNT_CODE` / `MEMBER_ACCOUNT_NAME` | 展示用 |
| `MEMBER_COMPANY_ID` | 公司範圍 |
| `MEMBER_MINI_GRID_SHELL_CCY` | 首屏骨架用幣別列（預設 `['MYR','SGD']`） |
| `MEMBER_MINI_GRID_SHELL_ROWS` | 首屏骨架最少列數（預設 5） |

**React**：用同一套 config（context / env），保持 **linked root ≠ 畫面上 account** 的語意。

---

## 2. 頂部主版面（`member-dash-columns`）

### 2.1 兩欄 Grid

- **左欄**：`member-dash-col-filters` — Capture Date、（可選）Company、Account 膠囊、`Currency:` 膠囊
- **右欄**：`member-dash-right-rail` — 迷你矩陣 + Total（整段可隱藏）

CSS 要點：

- `grid-template-columns: clamp(260px, 40%, 560px) minmax(0, 1fr)`
- 變數 `--member-dash-matrix-toolbar-slot`（約 34px）供 Accounts 工具列與（歷史上）Total 占位對齊；目前 Total 用 **外層 Grid** 與 Accounts **同列頂對齊**，見 §3

### 2.2 僅篩選、無右側迷你區時

- JS 在隱藏右欄時為 `member-dash-columns` 加上：`member-dash-columns--no-mini-rail`
- CSS：`grid-template-columns: minmax(0, 1fr)`，篩選佔滿寬

---

## 3. 右側資料帶（`member-dash-right-rail`）— 結構與對齊

### 3.1 DOM 順序（**重要**，與 CSS Grid 佈局一致）

1. `member-dash-rail-toolbar` → 內有 `member-dash-mini-toolbar`（**Accounts** 按鈕 + `#member_balance_grid_currency_line`，平時留空）
2. `member-dash-rail-matrix` → `#member_balance_grid` + hint
3. `member-dash-rail-total` → Total 卡片

### 3.2 內層 CSS Grid（實作「Total 頂對齊 Accounts」）

- `display: grid`
- `grid-template-columns: minmax(0, max-content) minmax(104px, max-content)`  
  - 第一欄：矩陣（寬度由內容 + 上限 cap，內層橫向捲動）  
  - 第二欄：**Total 至少 104px**，避免被壓成 0 寬消失
- `grid-template-rows: auto auto`
- 放置（欄 × 列）：
  - **Toolbar**：第 1 欄、第 1 列
  - **Matrix**（含 hint）：第 1 欄、第 2 列
  - **Total**：第 2 欄、**第 1～2 列跨列**（`grid-row: 1 / 3`），使 Total 卡片頂邊與 **Accounts 同一列** 對齊

### 3.3 整段靠父欄右緣（老闆需求：從右邊）

- 父：`member-dash-columns` 的第二欄是 `minmax(0,1fr)`
- 子：`.member-dash-columns > .member-dash-right-rail`  
  - `justify-self: end`（Grid 子項用 **`end`**，沒有 `justify-self: flex-end`）  
  - `width: max-content` + `max-width: 100%`  
- 這樣「Accounts + 矩陣 + Total」整塊 **貼齊卡片右側**，左側留白在「篩選與資料區之間」，而非矩陣與 Total 之間

### 3.4 溢出與裁切

- Win/Loss 容器使用 `overflow-x: clip` + `overflow-y: visible`，避免 Period 下拉被不當裁切；橫向捲動主要在 **迷你矩陣** 內

---

## 4. 迷你帳戶 × 幣別矩陣（Mini Matrix）

### 4.1 語意

- **列**：關聯帳號（依 `memberLinkedAccountsList` 順序，再過濾「該帳是否持有當前列出的幣別」）
- **欄**：當前選定要展示的幣別（與 Currency 膠囊 / 下方明細順序一致）
- **格子**：區間內該帳該幣之 **closing balance**（與明細同源：`history_api` 最後一筆有效 balance），**不用** search summary 的 balance（程式註釋已定義理由）

### 4.2 CSS Grid 欄寬（JS 動態）

- `memberMiniMatrixGridTemplateColumns(ncu)`：  
  `minmax(5.5rem, max-content)` + `repeat(ncu, minmax(5.5rem, max-content))`
- 與 CSS 變數 `--member-mini-ccy-min: 5.5rem`、`--member-mini-matrix-visible-ccy: 8` 等搭配：**僅可視約 8 幣寬**，多餘 **矩陣容器內** `overflow-x: auto`
- **列頭 / 帳號欄**：`position: sticky; left: 0`（corner + rowhead），橫滑時帳號列固定

### 4.3 多幣（≥8）

- class：`member-balance-mini-matrix--many-ccy`，收緊 padding / 字級

### 4.4 首屏骨架（無 API 前）

- `renderMemberMiniGridInitialShell()` 用 `MEMBER_MINI_GRID_SHELL_*` 畫表頭 + 占位列，避免白屏

---

## 5. Total 區（`#member_balance_total_value`）

### 5.1 版型

- 外框：`member-dash-total-matrix`（標題 **Total** + `member-dash-total-matrix-body`）
- **多幣**：`member-dash-total-values--grid` + `member-dash-total-currency-grid`，每行 `幣別 + 金額`
- **單幣**：同樣用 **一行兩欄**（幣別代碼 + 金額），不要只顯示裸數字（與多幣視覺一致）

### 5.2 金額

- 負數樣式：`member-dash-total-grid-amt--neg`
- body `max-height` + 縱向捲動僅在 `member-dash-total-matrix-body`

### 5.3 `#member_balance_grid_currency_line`

- 刻意留白，不再在「Accounts」旁重複顯示幣別一句話；`:empty` 時 CSS `display: none`

---

## 6. 幣別選擇 — 與迷你區顯示規則

### 6.1 狀態

- `memberIsAllSelected`（boolean）
- `memberSelectedCurrencies`（`Set`，大寫幣別）
- **All**：展示 `getAvailableCurrencies()` 全部
- **非 All、且未勾任何幣**：`getMemberMiniGridCurrencies()` 必須回 **[]**（**禁止**再用 `available` 全列表兜底），否則會與下方「请选择货币」矛盾

### 6.2 右側迷你區顯示條件（`syncMemberDashRightRailVisibility`）

顯示 **同時** 滿足：

1. `memberLinkedAccountsList.length > 0`
2. `getMemberMiniGridCurrencies().length > 0`

否則：`member-dash-right-rail` `display: none`，並在 `member-dash-columns` 加上 `member-dash-columns--no-mini-rail`。

### 6.3 與明細表一致

- `fetchMemberHistory`：若「有可用幣別但使用者未選任何幣」→ 只顯示占位（如「请选择货币」），並應 **clear 迷你區**（與現行 JS 一致）

---

## 7.「Accounts in grid」Modal

### 7.1 行為

- 開啟：關聯帳號列表非空
- 勾選帳號 id 存入 `sessionStorage`（鍵與 `memberWLGridStorageKey()` 邏輯一致）
- Apply：至少選一個；刷新幣別聯集與搜尋

### 7.2 列表 UI（省空間）

- **不顯示**「帳號後綴的一長串幣別」；只顯示帳號代碼/名稱
- 勾選區：**4 欄** Grid（`repeat(4, minmax(0, 1fr))`）；窄屏可降為 2 欄
- Modal 寬：覆寫全站 `transaction-modal-content` 的超大 `width`，約 **`min(100%, 400px)`**（文件以實際 `member.css` 為準）

### 7.3 「總 currency 對齊 / 從右邊」與 Modal 無直接關係，但同一頁設計一併遷移時請保留 Modal 寬與 4 欄行為。

---

## 8. 主要 API 依賴（實作 React 時對接同一後端）

| 用途 | 方向 |
|------|------|
| 關聯帳號列表 | `api/accounts/account_link_api.php?action=get_all_linked_accounts&account_id=&company_id=` |
| 批次帳戶可用幣別 | `api/accounts/account_currency_api.php`（batch / get_account_currencies） |
| Summary（幣別列表來源之一） | `api/transactions/search_api.php`（日期區間 + target account） |
| 迷你格 / 帳號列餘額 | `api/transactions/history_api.php`（依帳號、日期、幣別組合查） |
| 幣別排序（若有） | `api/transactions/user_currency_order_api.php` |

---

## 9. 響應式（`member.css`）

- **≤1180px**：`member-dash-columns` 通常變單欄；右側帶改 **flex column**、`align-items: flex-end`；**覆寫** `.member-dash-columns > .member-dash-right-rail` 為 `justify-self: stretch; width: 100%`，避免仍 `end + max-content` 怪版面
- **≤720px**：分割線與 padding 調整（見當前 `@media`）

---

## 10. React 實作建議對照表

| 領域 | 建議 |
|------|------|
| 設定 | `MemberConfigContext`：`accountId`、`linkedListRootAccountId`、`companyId` |
| 關聯帳號 | `useLinkedAccounts()` + `useWLGridSelection()`（對應 sessionStorage） |
| 幣別 | `useCurrencyFilters()`：`allSelected`、`selectedSet`、`availableCurrencies` |
| 迷你矩陣 | `MiniBalanceMatrix`：props `currencies[]`、`accounts[]`、`balances`、`onScroll` |
| Total | `MiniTotalsPanel`：單幣也顯示 code + amount |
| 右欄可見性 | `useMemo`：`showRail = linkedAccounts.length > 0 && gridCurrencies.length > 0` |
| 佈局 | 頂層：`CSS Grid`；右欄內：`Grid`（toolbar+matrix / total 跨越行），**禁止** Total 欄 `min-width: 0` 無下限 |
| Modal | `Dialog` + 4-column `display:grid` checkbox 區；**不含幣別長字串** |

---

## 11. 驗收檢查清單（React）

- [ ] 非 All 且未選任何幣：迷你矩陣 + Total **隱藏**，明細區提示選幣別  
- [ ] All 或已選幣：右側整塊 **靠卡片右緣**，Total **不消失**（第二欄 `minmax(104px, max-content)`）  
- [ ] Accounts 按鈕列與 Total 卡片 **頂邊對齊**（Grid 跨行，**非** 再用 spacer 對齊矩陣表頭）  
- [ ] 迷你矩陣橫向捲動、帳號欄 sticky  
- [ ] Modal 4 欄、無幣別贅字、寬度不繼承全站 1000px+ modal  

---

## 12. 檔案索引

| 檔案 | 內容 |
|------|------|
| `member.php` | 結構、Modal、全域變數、首屏骨架變數 |
| `js/member.js` | 狀態、API、矩陣/Total 渲染、可見性、Modal |
| `css/member.css` | Win/Loss 專用：`.member-dash-*`、`.member-balance-mini-*`、`.member-linked-filter-*`、媒體查詢 |

若日後後端欄位或 API 路徑變更，請以 **上述檔案實際內容** 為準並同步更新本指南。

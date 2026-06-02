# DataCaptureSummary 纯 React 迁移方案（API 不变）

## 目标

将 `datacapturesummary` 页面从 React + legacy 混合模式，迁移为纯 React + Vite + TanStack 架构；后端 API 保持不变（接口路径、参数、返回结构不改）。

---

## 当前现状（已识别）

页面已是“半迁移”状态，主要混合点：

- 仍加载 legacy 脚本：
  - `frontend/src/pages/datacapturesummary/lib/preloadSummaryLegacyScripts.js`
  - 依赖 `js/datacapturesummary.js`
- 仍通过 `window.__SUMMARY_*` 桥接 React 与 legacy
- 页面初始化仍调用 `window.initDataCaptureSummaryPage()`
- 表格 populate / submit 仍有 DOM + legacy 协作逻辑

---

## 迁移原则

- **后端 API 不变**：继续使用 `api/datacapture_summary/summary_api.php` 相关 action
- **前端状态单一来源**：React state / hooks / TanStack Query & Mutation
- **计算与渲染分离**：业务计算纯函数化，UI 仅渲染结果
- **渐进替换（Strangler）**：先并行，再切流，最后清理

---

## PR 拆分计划

## PR1：切断 legacy 启动入口（加开关，可回退）

### 目标
在 pure-react 开关打开时，不再依赖 legacy 脚本启动页面。

### 改动范围
- `frontend/src/pages/datacapturesummary/DataCaptureSummaryPage.jsx`

### 执行项
- 新增开关：`import.meta.env.VITE_SUMMARY_PURE_REACT`
- 开关开启时禁用：
  - `ensureSummaryLegacyScriptsLoaded()`
  - `window.initDataCaptureSummaryPage()`
  - `window.__SUMMARY_*` 注入
- 保留 legacy 分支以便快速回退

### 验收
- `/datacapturesummary` 正常打开
- 空态、ActionBar、SubmitBar、Modal 能显示
- 控制台无 legacy init 缺失错误

---

## PR2：表格数据流改为纯 React（核心）

### 目标
彻底移除 DOM 驱动的 populate / 重排逻辑。

### 改动范围
- `frontend/src/pages/datacapturesummary/hooks/useSummaryTablePopulate.js`（建议重构为 `useSummaryTableModel.js`）
- `frontend/src/pages/datacapturesummary/table/summaryRowModel.js`
- `frontend/src/pages/datacapturesummary/components/SummaryTable.jsx`
- `frontend/src/pages/datacapturesummary/components/SummaryTableRow.jsx`

### 执行项
- 将表格初始化、重排、分组逻辑迁移为纯函数
- 输入：capture data + process metadata
- 输出：`rows`（完整显示态 + 编辑态）
- 删除对 DOM 操作依赖：`querySelector` / `innerHTML` / `appendChild`
- 删除对 `summaryTablePostPopulate` 的 DOM 协作依赖

### 验收
- refresh、重算、重排稳定
- 不再依赖 `window.__SUMMARY_REACT_SET_ROW_ORDER__` 等桥接

---

## PR3：公式编辑链路 React 化

### 目标
公式相关流程脱离 window bridge，全部由 hook/state 驱动。

### 改动范围
- `frontend/src/pages/datacapturesummary/hooks/useSummaryEditFormula.js`
- `frontend/src/pages/datacapturesummary/hooks/useSummaryFormulaEngine.js`
- `frontend/src/pages/datacapturesummary/formula/summaryFormulaEngineBridge.js`（最终删除）
- `frontend/src/pages/datacapturesummary/formula/summaryFormulaReference.js`
- `frontend/src/pages/datacapturesummary/formula/summarySaveFormula.js`

### 执行项
- 保留 parse/evaluate 纯逻辑
- 删除 register/unregister 到 `window` 的桥接
- `EditFormulaModal` 直接读写 React 行状态

### 验收
- 开窗、编辑、保存、取消行为一致
- 公式更新即时体现在表格 state

---

## PR4：提交与删除流程纯 React + TanStack Mutation

### 目标
提交流程不再从 DOM 采集，直接从 rows/state 构建 payload。

### 改动范围
- `frontend/src/pages/datacapturesummary/hooks/useSummarySubmit.js`
- `frontend/src/pages/datacapturesummary/submit/summarySubmitRowCollection.js`
- `frontend/src/pages/datacapturesummary/submit/summarySubmitExecution.js`
- `frontend/src/pages/datacapturesummary/lib/summaryDeleteFlow.js`
- `frontend/src/pages/datacapturesummary/hooks/useSummaryPageActions.js`

### 执行项
- `useMutation` 承担 submit/delete/save state
- collection 从 React rows 读取，不再查 DOM
- 成功后 `invalidateQueries(summaryQueryKeys.serverState(...))`
- 错误处理（含 413 / payload too large）保留兼容提示

### 验收
- 提交、删除、通知、回跳行为与现状一致
- API 请求协议保持不变

---

## PR5：清理 legacy 资产与桥接代码

### 目标
页面完全纯 React，无遗留桥接。

### 删除候选
- `frontend/src/pages/datacapturesummary/lib/preloadSummaryLegacyScripts.js`
- `frontend/src/pages/datacapturesummary/hooks/useSummaryTableBridge.js`
- `frontend/src/pages/datacapturesummary/table/summaryTableDomBridge.js`
- `frontend/src/pages/datacapturesummary/hooks/useSummaryLegacyChrome.js`
- `frontend/src/pages/datacapturesummary/formula/summaryFormulaEngineBridge.js`
- `js/datacapturesummary.js`（确认无引用后删除）

### 验收
- `datacapturesummary` 目录内无 `window.__SUMMARY_*` 运行时依赖
- 不再加载 legacy summary bundle
- 功能回归通过

---

## 建议保留与复用模块

### 保留
- `frontend/src/pages/datacapturesummary/lib/summaryApi.js`
- `frontend/src/pages/datacapturesummary/lib/summaryQueryKeys.js`
- `frontend/src/pages/datacapturesummary/lib/summaryStorage.js`
- `frontend/src/pages/datacapturesummary/formula/summaryFormulaParseUtils.js`
- `frontend/src/pages/datacapturesummary/formula/summaryFormulaEvaluate.js`

### 重写/重构
- `useSummaryTablePopulate.js`
- `useSummarySubmit.js`
- `useSummaryPageActions.js`

---

## 风险点与对应策略

- **风险：fresh capture / revisit 逻辑回归**
  - 策略：保留现有 storage key 和 query 参数语义，新增 e2e 场景覆盖
- **风险：公式行为与 legacy 有细微差异**
  - 策略：为 parse/evaluate 增加样例回归测试（正负数、千分位、百分比）
- **风险：批量提交超限**
  - 策略：沿用当前分批策略与 413 提示，Mutation 中做统一错误归一化

---

## 测试清单（每个 PR 至少覆盖）

- 进入 `/datacapturesummary`
- fresh capture (`?success=1`)
- revisit + server state restore
- 编辑公式 + 保存
- 删除选中行
- 提交成功 / 提交失败（含大 payload 错误）
- company/group scope 切换下数据正确性

---

## 构建与发布前检查

本仓库规则要求：凡改 `frontend/`，结束前必须执行并通过：

```bash
cd frontend
npm run build
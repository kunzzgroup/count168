import "./accountingReportTable.css";

/**
 * 统一 Accounting Report 表格外壳。
 * 布局：Report Container → Scroll → Fixed-width Table
 * 颜色由各页面 CSS 覆盖，本组件只负责结构与滚动行为。
 */
export function AccountingReportPage({ className = "", children }) {
  return <div className={`ec-accounting-report-page ${className}`.trim()}>{children}</div>;
}

export function AccountingReportContainer({ className = "", children }) {
  return <div className={`ec-accounting-report-container ${className}`.trim()}>{children}</div>;
}

export function AccountingReportScroll({ className = "", ariaLabel, children }) {
  return (
    <div
      className={`ec-accounting-report-scroll ${className}`.trim()}
      role={ariaLabel ? "region" : undefined}
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

export default function AccountingReportTable({
  className = "",
  tableClassName = "",
  minWidth,
  colgroup,
  thead,
  tbody,
  ariaLabel,
  scrollClassName = "",
}) {
  return (
    <AccountingReportScroll className={scrollClassName} ariaLabel={ariaLabel}>
      <table
        className={`ec-accounting-report-table ${tableClassName} ${className}`.trim()}
        style={minWidth ? { minWidth: `${minWidth}px` } : undefined}
      >
        {colgroup}
        {thead ? <thead>{thead}</thead> : null}
        {tbody ? <tbody>{tbody}</tbody> : null}
      </table>
    </AccountingReportScroll>
  );
}

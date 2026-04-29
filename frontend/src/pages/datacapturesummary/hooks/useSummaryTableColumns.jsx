import { useMemo } from "react";

export function useSummaryTableColumns({
  accountOptions,
  currencyOptions,
  openAddModal,
  setSummaryRows,
  computeProcessedAmounts,
  formatAmountDisplay,
}) {
  return useMemo(
    () => [
      {
        id: "idProduct",
        header: "Id Product",
        meta: { className: "id-product-header" },
        cell: ({ row }) => {
          const value = row.original.idProduct;
          return (
            <td className="id-product" data-main-product={value} data-sub-product="" title={value || undefined}>
              {value}
            </td>
          );
        },
      },
      {
        id: "account",
        header: "Account",
        cell: ({ row }) => (
          <td>
            <select
              value={row.original.accountId ?? ""}
              onChange={(e) => {
                const selected = accountOptions.find((a) => String(a.id) === e.target.value);
                setSummaryRows((prev) =>
                  prev.map((item) =>
                    item.id === row.original.id
                      ? {
                          ...item,
                          accountId: selected?.id ?? null,
                          account: selected ? `${selected.account_id}${selected.name ? ` (${selected.name})` : ""}` : "",
                        }
                      : item,
                  ),
                );
              }}
            >
              <option value="">Select Account</option>
              {accountOptions.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.account_id}
                  {acc.name ? ` (${acc.name})` : ""}
                </option>
              ))}
            </select>
          </td>
        ),
      },
      {
        id: "addAccount",
        header: "",
        cell: () => (
          <td>
            <button className="add-account-btn" type="button" onClick={openAddModal}>
              +
            </button>
          </td>
        ),
      },
      {
        id: "currency",
        header: "Currency",
        cell: ({ row }) => (
          <td>
            <select
              value={row.original.currencyId ?? ""}
              onChange={(e) => {
                const selected = currencyOptions.find((c) => String(c.id) === e.target.value);
                setSummaryRows((prev) =>
                  prev.map((item) =>
                    item.id === row.original.id
                      ? {
                          ...item,
                          currencyId: selected?.id ?? null,
                          currency: selected?.code ?? "",
                        }
                      : item,
                  ),
                );
              }}
            >
              <option value="">Currency</option>
              {currencyOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
            </select>
          </td>
        ),
      },
      {
        id: "formula",
        header: "Formula",
        cell: ({ row }) => (
          <td>
            <input
              value={row.original.formula}
              onChange={(e) => {
                const formula = e.target.value;
                setSummaryRows((prev) =>
                  prev.map((item) =>
                    item.id === row.original.id ? { ...item, formula, ...computeProcessedAmounts(formula, item.source || "1", item.rateValue) } : item,
                  ),
                );
              }}
            />
          </td>
        ),
      },
      {
        id: "source",
        header: "Source",
        cell: ({ row }) => (
          <td>
            <input
              value={row.original.source}
              placeholder="1"
              onChange={(e) => {
                const source = e.target.value;
                setSummaryRows((prev) =>
                  prev.map((item) =>
                    item.id === row.original.id ? { ...item, source, ...computeProcessedAmounts(item.formula, source || "1", item.rateValue) } : item,
                  ),
                );
              }}
            />
          </td>
        ),
      },
      {
        id: "rate",
        header: "Rate",
        cell: ({ row }) => (
          <td style={{ textAlign: "center" }}>
            <input
              type="checkbox"
              className="rate-checkbox"
              onChange={(e) => {
                setSummaryRows((prev) => prev.map((item) => (item.id === row.original.id ? { ...item, rateChecked: e.currentTarget.checked } : item)));
              }}
              checked={row.original.rateChecked}
            />
          </td>
        ),
      },
      {
        id: "rateValue",
        header: "Rate Value",
        cell: ({ row }) => (
          <td className="editable-cell" style={{ textAlign: "center", cursor: "text" }}>
            <input
              value={row.original.rateValue}
              placeholder="*3 or /3"
              onChange={(e) => {
                const rateValue = e.target.value;
                setSummaryRows((prev) =>
                  prev.map((item) =>
                    item.id === row.original.id ? { ...item, rateValue, ...computeProcessedAmounts(item.formula, item.source || "1", rateValue) } : item,
                  ),
                );
              }}
            />
          </td>
        ),
      },
      {
        id: "processedAmount",
        header: "Processed Amount",
        cell: ({ row }) => <td>{formatAmountDisplay(row.original.processedAmount)}</td>,
      },
      {
        id: "skip",
        header: "Skip",
        cell: ({ row }) => (
          <td style={{ textAlign: "center" }}>
            <input
              type="checkbox"
              className="summary-select-checkbox"
              onChange={(e) => {
                setSummaryRows((prev) => prev.map((item) => (item.id === row.original.id ? { ...item, skipChecked: e.currentTarget.checked } : item)));
              }}
              checked={row.original.skipChecked}
            />
          </td>
        ),
      },
      {
        id: "delete",
        header: "Delete",
        cell: ({ row }) => (
          <td style={{ textAlign: "center" }}>
            <input
              type="checkbox"
              className="summary-row-checkbox"
              data-value={row.original.idProduct}
              onChange={() => {
                setSummaryRows((prev) => prev.map((item) => (item.id === row.original.id ? { ...item, deleteChecked: !item.deleteChecked } : item)));
              }}
              checked={row.original.deleteChecked}
            />
          </td>
        ),
      },
    ],
    [accountOptions, computeProcessedAmounts, currencyOptions, formatAmountDisplay, openAddModal, setSummaryRows],
  );
}

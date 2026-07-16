import { useOverlayLock } from "../../hooks/useOverlayLock.js";

export default function ContraInboxSheet({ open, onClose, m, items = [], loading, onApprove, onReject, mutationsBlocked }) {
  useOverlayLock(open, onClose);
  if (!open) return null;

  const count = items.length;
  const awaiting =
    count === 1
      ? m.contraInboxAwaitingApproval.replace("{count}", String(count))
      : m.contraInboxAwaitingApprovalPlural.replace("{count}", String(count));

  return (
    <div className="fixed inset-0 z-[85] flex flex-col justify-end bg-slate-900/40 backdrop-blur-[2px]">
      <button type="button" className="min-h-0 flex-1" aria-label={m.close} onClick={onClose} />
      <div className="flex max-h-[85dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-[15px] font-bold text-slate-900">{m.contraInbox}</p>
            <p className="text-[11px] font-medium text-slate-500">{awaiting}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="tap-scale grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-500"
          >
            <i className="fas fa-times" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {loading ? (
            <p className="py-10 text-center text-[13px] font-semibold text-slate-500">{m.loading}</p>
          ) : count === 0 ? (
            <div className="space-y-2 py-8 text-center">
              <p className="text-[13px] font-semibold text-slate-700">{m.contraInboxEmpty}</p>
              <p className="text-[12px] leading-relaxed text-slate-500">{m.contraInboxEmptyHint}</p>
            </div>
          ) : (
            items.map((item) => {
              const id = item.transaction_id || item.id;
              return (
                <article key={String(id)} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-slate-900">
                        {String(item.transaction_type || "CONTRA").toUpperCase()}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {item.transaction_date || item.date || "—"} · {item.currency || ""}
                      </p>
                      <p className="mt-1 truncate text-[12px] text-slate-600">
                        {(item.from_account_id || item.from_account || "?") +
                          " → " +
                          (item.account_id || item.to_account || "?")}
                      </p>
                      <p className="mt-0.5 text-[12px] font-bold tabular-nums text-slate-800">
                        {item.amount ?? "—"}
                      </p>
                      {item.submitted_by || item.created_by ? (
                        <p className="mt-1 text-[11px] text-slate-400">
                          {m.submittedBy}: {item.submitted_by || item.created_by}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled={mutationsBlocked}
                      onClick={() => onApprove?.(id)}
                      className="tap-scale flex-1 rounded-xl bg-emerald-600 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
                    >
                      {m.approve}
                    </button>
                    <button
                      type="button"
                      disabled={mutationsBlocked}
                      onClick={() => {
                        if (window.confirm(m.confirmRejectContra)) onReject?.(id);
                      }}
                      className="tap-scale flex-1 rounded-xl bg-rose-600 py-2.5 text-[13px] font-bold text-white disabled:opacity-40"
                    >
                      {m.reject}
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

import { calculateCountdown, formatDate } from "../domainHelpers.js";

/**
 * Company Expiration Status Modal (read-only view)
 * Props:
 *   companies: Array<{ company_id, expiration_date }>
 *   onClose()
 */
export default function CompanyExpirationModal({ companies, onClose }) {
  return (
    <div className="fixed inset-0 z-[10002] bg-black/50 backdrop-blur-[4px]" style={{ display: "block" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative mx-auto mt-[2%] w-[clamp(400px,36.46vw,700px)] max-w-[600px] overflow-hidden rounded-2xl border-0 bg-white shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]">
        <button type="button" className="absolute right-5 top-[clamp(10px,1.04vw,20px)] z-[10001] flex h-[clamp(26px,1.88vw,36px)] w-[clamp(26px,1.88vw,36px)] items-center justify-center rounded-full text-[clamp(20px,1.46vw,28px)] font-normal leading-none text-slate-500 transition-all hover:scale-110 hover:bg-slate-100 hover:text-slate-700" onClick={onClose}>&times;</button>
        <h2 className="m-0 w-full border-b border-slate-200 bg-slate-50 px-[clamp(22px,1.67vw,32px)] py-[clamp(10px,1.04vw,20px)] text-[clamp(14px,1.25vw,24px)] font-bold text-slate-800">Company Expiration Status</h2>
        <div className="block px-[clamp(20px,1.67vw,32px)] py-[clamp(10px,1.04vw,20px)]">
          <div className="min-h-[100px] max-h-[400px] overflow-y-auto">
            {!companies || companies.length === 0 ? (
              <div className="p-5 text-center text-slate-400">
                No companies found
              </div>
            ) : (
              companies.map((company) => {
                const expDate = company.expiration_date || null;
                const countdown = expDate ? calculateCountdown(expDate) : null;
                const formattedDate = expDate ? formatDate(expDate) : "No expiration date";

                let statusClass = "normal";
                let statusText = "Valid";
                if (countdown) {
                  statusClass = countdown.status;
                  statusText = countdown.text;
                } else if (!expDate) {
                  statusClass = "warning";
                  statusText = "No date set";
                }

                return (
                  <div key={company.company_id} className="mb-2 flex items-center justify-between rounded-lg border border-gray-200 bg-white px-[clamp(10px,1.04vw,16px)] py-[clamp(8px,0.83vw,12px)] transition-all hover:bg-gray-50 hover:shadow-[0_2px_4px_rgba(0,0,0,0.05)]">
                    <div className="flex flex-col gap-1">
                      <div className="text-[clamp(10px,0.73vw,14px)] font-bold text-slate-800">{company.company_id}</div>
                      <div className="text-[clamp(8px,0.625vw,12px)] font-bold text-slate-500">Expiration: {formattedDate}</div>
                    </div>
                    <div className={`rounded-xl px-[clamp(8px,0.625vw,12px)] py-[clamp(4px,0.31vw,6px)] text-[clamp(8px,0.625vw,12px)] font-semibold whitespace-nowrap ${statusClass === "expired" ? "bg-red-100 text-red-800" : statusClass === "warning" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{statusText}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

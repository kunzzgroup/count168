import { useState, useEffect } from "react";
import { buildApiUrl } from "../../../utils/apiUrl.js";
import { showDomainAlert } from "./DomainNotification.jsx";
import { formatDomainFeeDisplay2, formatDomainFeeEdit2 } from "../domainHelpers.js";
import { getDomainText } from "../../../translateFile/domainTranslate.js";

/**
 * Fee Settings Modal — Price setting for domain list
 * Props:
 *   onClose()
 *   onFeeSaved(data) — called after successful save with { price }
 */
export default function DomainFeeModal({ onClose, onFeeSaved, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  const [price, setPrice] = useState("");
  const [summary, setSummary] = useState("");

  useEffect(() => {
    fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "get_domain_fee_settings" }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.data) {
          const p2 = formatDomainFeeDisplay2(res.data.price);
          setSummary(t("feeSummary", { price: p2 }));
          setPrice(formatDomainFeeEdit2(res.data.price));
        } else {
          showDomainAlert(res.message || t("couldNotLoadSettings"), "danger");
        }
      })
      .catch(() => showDomainAlert(t("couldNotLoadSettings"), "danger"));
  }, [lang]);

  function handleSave() {
    fetch(buildApiUrl("api/domain/domain_api.php"), {
      cache: "no-cache",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_domain_fee_settings", price }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res.success) {
          showDomainAlert(res.message || t("saved"));
          if (res.data) onFeeSaved(res.data);
          onClose();
        } else {
          showDomainAlert(res.message || t("saveFailed"), "danger");
        }
      })
      .catch(() => showDomainAlert(t("saveFailed"), "danger"));
  }

  return (
    <div className="fixed inset-0 z-[10004] bg-black/50 backdrop-blur-[4px]" style={{ display: "block" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="relative mx-auto mt-[2%] w-[clamp(400px,36.46vw,700px)] max-w-[440px] overflow-hidden rounded-2xl border-0 bg-white shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_10px_10px_-5px_rgba(0,0,0,0.04)]">
        <button type="button" className="absolute right-5 top-[clamp(10px,1.04vw,20px)] z-[10001] flex h-[clamp(26px,1.88vw,36px)] w-[clamp(26px,1.88vw,36px)] items-center justify-center rounded-full text-[clamp(20px,1.46vw,28px)] font-normal leading-none text-slate-500 transition-all hover:scale-110 hover:bg-slate-100 hover:text-slate-700" onClick={onClose}>&times;</button>
        <h2 className="m-0 w-full border-b border-slate-200 bg-slate-50 px-[clamp(22px,1.67vw,32px)] py-[clamp(10px,1.04vw,20px)] text-[clamp(14px,1.25vw,24px)] font-bold text-slate-800">{t("price")}</h2>
        <div className="block px-[clamp(20px,1.67vw,32px)] py-[clamp(10px,1.04vw,20px)]">
          <p className="mb-2.5 mt-0 text-[clamp(10px,0.78vw,14px)] text-slate-500">
            {t("priceDescription")}
          </p>
          <div className="mb-3 rounded-[clamp(4px,0.42vw,8px)] border border-slate-200 bg-slate-100 px-[clamp(10px,0.83vw,14px)] py-[clamp(8px,0.63vw,12px)] text-[clamp(11px,0.83vw,15px)] leading-[1.45] text-slate-800" aria-live="polite"
            dangerouslySetInnerHTML={{ __html: summary }} />
          <p className="mb-3 mt-0 text-[clamp(9px,0.73vw,13px)] text-slate-500">{t("editFieldHint")}</p>
          <div className="mb-[clamp(6px,0.625vw,12px)]">
            <label htmlFor="domainFeePrice">
              {t("price")} <span className="text-[0.92em] font-normal text-slate-400">({t("editWord")})</span>
            </label>
            <input
              type="number"
              id="domainFeePrice"
              className="w-full box-border rounded-[clamp(4px,0.42vw,8px)] border border-gray-300 bg-white px-[clamp(6px,0.63vw,12px)] py-[clamp(5px,0.42vw,8px)] text-[clamp(10px,0.83vw,16px)] transition-all focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
              step="0.01"
              placeholder={t("pricePlaceholder")}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="mt-5 flex flex-wrap gap-2.5 border-t border-slate-200 pt-4">
            <button type="button" className="cursor-pointer rounded-md border-0 bg-[linear-gradient(180deg,#63C4FF_0%,#0D60FF_100%)] px-5 py-[clamp(6px,0.42vw,8px)] font-['Amaranth'] text-[clamp(10px,0.83vw,16px)] text-white shadow-[0_2px_4px_rgba(0,123,255,0.3)] transition-all hover:-translate-y-px hover:bg-[linear-gradient(180deg,#0D60FF_0%,#63C4FF_100%)] hover:shadow-[0_4px_8px_rgba(1,59,153,0.4)]" onClick={handleSave}>{t("save")}</button>
            <button type="button" className="cursor-pointer rounded-md border-0 bg-[linear-gradient(180deg,#bcbcbc_0%,#585858_100%)] px-5 py-[clamp(6px,0.42vw,8px)] font-['Amaranth'] text-[clamp(10px,0.83vw,16px)] text-white shadow-[0_2px_4px_rgba(88,88,88,0.3)] transition-all hover:-translate-y-px hover:bg-[linear-gradient(180deg,#585858_0%,#bcbcbc_100%)] hover:shadow-[0_4px_8px_rgba(84,84,84,0.4)]" onClick={onClose}>{t("cancel")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

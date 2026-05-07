/** Confirm delete modal — pure React replacement */
import { getDomainText } from "../../../translateFile/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

export default function DomainConfirmModal({ message, onConfirm, onClose, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  return (
    <DomainModalPortal>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-[8px]">
        <div className="relative w-[clamp(400px,35vw,550px)] max-w-[90%] overflow-hidden rounded-[24px] border-0 bg-gradient-to-b from-white to-slate-50 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]">
          <div className="flex items-center justify-center pb-[clamp(15px,1.3vw,25px)] pt-[clamp(30px,2.6vw,50px)]">
            <svg className="h-[clamp(50px,4.17vw,80px)] w-[clamp(50px,4.17vw,80px)] rounded-full bg-gradient-to-br from-red-100 to-red-200 p-[clamp(10px,0.83vw,16px)] text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="m-0 mb-[clamp(15px,1.3vw,25px)] text-center font-['Amaranth'] text-[clamp(20px,1.67vw,32px)] font-bold tracking-[-0.02em] text-slate-800">{t("confirmDeleteTitle")}</h2>
          <p className="m-0 max-h-[300px] overflow-y-auto whitespace-pre-line px-[clamp(25px,2.08vw,40px)] text-center text-[clamp(13px,0.94vw,18px)] font-medium leading-[1.7] text-slate-600">{message}</p>
          <div className="mt-[clamp(18px,1.67vw,32px)] flex justify-center gap-3 bg-slate-50/80 p-[clamp(25px,2.08vw,40px)]">
            <button type="button" className="cursor-pointer rounded-md border-0 bg-[linear-gradient(180deg,#bcbcbc_0%,#585858_100%)] px-5 py-[clamp(6px,0.42vw,8px)] font-['Amaranth'] text-[clamp(10px,0.83vw,16px)] text-white shadow-[0_2px_4px_rgba(88,88,88,0.3)] transition-all hover:-translate-y-px hover:bg-[linear-gradient(180deg,#585858_0%,#bcbcbc_100%)] hover:shadow-[0_4px_8px_rgba(84,84,84,0.4)]" onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="button" className="cursor-pointer rounded-md border-0 bg-[linear-gradient(180deg,#F30E12_0%,#A91215_100%)] px-5 py-[clamp(6px,0.42vw,8px)] font-['Amaranth'] text-[clamp(10px,0.83vw,16px)] text-white shadow-[0_2px_4px_rgba(220,53,69,0.3)] transition-all hover:-translate-y-px hover:bg-[linear-gradient(180deg,#A91215_0%,#F30E12_100%)] hover:shadow-[0_4px_8px_rgba(220,53,69,0.4)]" onClick={onConfirm}>
              {t("delete")}
            </button>
          </div>
        </div>
      </div>
    </DomainModalPortal>
  );
}

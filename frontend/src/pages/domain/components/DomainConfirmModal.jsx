/** Confirm delete modal — pure React replacement */
import { getDomainText } from "../../../translateFile/domainTranslate.js";
import DomainModalPortal from "./DomainModalPortal.jsx";

export default function DomainConfirmModal({ message, onConfirm, onClose, lang = "en" }) {
  const t = (key, params) => getDomainText(lang, key, params);
  return (
    <DomainModalPortal>
      <div style={{ position: "fixed", inset: 0, zIndex: 50000, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
        <div style={{ position: "relative", width: "clamp(400px,35vw,550px)", maxWidth: "90%", overflow: "hidden", borderRadius: 24, border: 0, background: "linear-gradient(180deg,#ffffff 0%,#f8fafc 100%)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "clamp(30px,2.6vw,50px)", paddingBottom: "clamp(15px,1.3vw,25px)" }}>
            <svg style={{ width: "clamp(50px,4.17vw,80px)", height: "clamp(50px,4.17vw,80px)", borderRadius: "9999px", background: "linear-gradient(135deg,#fee2e2 0%,#fecaca 100%)", padding: "clamp(10px,0.83vw,16px)", color: "#dc2626" }} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 style={{ margin: 0, marginBottom: "clamp(15px,1.3vw,25px)", textAlign: "center", fontFamily: "Amaranth", fontSize: "clamp(20px,1.67vw,32px)", fontWeight: 700, letterSpacing: "-0.02em", color: "#1f2937" }}>{t("confirmDeleteTitle")}</h2>
          <p style={{ margin: 0, maxHeight: 300, overflowY: "auto", whiteSpace: "pre-line", padding: "0 clamp(25px,2.08vw,40px)", textAlign: "center", fontSize: "clamp(13px,0.94vw,18px)", fontWeight: 500, lineHeight: 1.7, color: "#475569" }}>{message}</p>
          <div style={{ marginTop: "clamp(18px,1.67vw,32px)", display: "flex", justifyContent: "center", gap: 12, background: "rgba(248,250,252,0.8)", padding: "clamp(25px,2.08vw,40px)" }}>
            <button type="button" style={{ cursor: "pointer", borderRadius: 6, border: 0, background: "linear-gradient(180deg,#bcbcbc 0%,#585858 100%)", padding: "clamp(6px,0.42vw,8px) 20px", fontFamily: "Amaranth", fontSize: "clamp(10px,0.83vw,16px)", color: "#fff", boxShadow: "0 2px 4px rgba(88,88,88,0.3)" }} onClick={onClose}>
              {t("cancel")}
            </button>
            <button type="button" style={{ cursor: "pointer", borderRadius: 6, border: 0, background: "linear-gradient(180deg,#F30E12 0%,#A91215 100%)", padding: "clamp(6px,0.42vw,8px) 20px", fontFamily: "Amaranth", fontSize: "clamp(10px,0.83vw,16px)", color: "#fff", boxShadow: "0 2px 4px rgba(220,53,69,0.3)" }} onClick={onConfirm}>
              {t("delete")}
            </button>
          </div>
        </div>
      </div>
    </DomainModalPortal>
  );
}

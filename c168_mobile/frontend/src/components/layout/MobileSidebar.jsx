import { NavLink } from "react-router-dom";
import { mobileNavItems } from "../../utils/mobilePermissions.js";

function displayCompany(c) {
  return String(c?.company_id || c?.name || c?.id || "").toUpperCase();
}

export default function MobileSidebar({
  open,
  onClose,
  i18n,
  me,
  companyCode,
  groupId,
  companies = [],
  onSwitchCompany,
  onLogout,
}) {
  const navItems = mobileNavItems(me);
  const name = me?.nickname || me?.username || me?.name || "—";
  const role = String(me?.role || me?.user_type || "").toUpperCase();

  return (
    <div
      className={`absolute inset-0 z-[70] transition-opacity duration-300 ${
        open ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      aria-hidden={!open}
      inert={open ? undefined : true}
    >
      <button
        type="button"
        aria-label={i18n?.closeMenu || "Close menu"}
        onClick={onClose}
        className="absolute inset-0 size-full border-0 bg-slate-900/35 backdrop-blur-[2px]"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={i18n?.menu || "Menu"}
        className={`absolute inset-y-0 left-0 flex w-[min(86vw,320px)] max-w-full flex-col bg-white shadow-[8px_0_32px_-12px_rgba(15,23,42,0.35)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ paddingTop: "max(10px, env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 pb-4 pt-2">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-bold text-slate-900">{name}</p>
            <p className="mt-0.5 text-[12px] font-semibold uppercase tracking-wide text-slate-400">
              {role || "USER"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500"
            aria-label={i18n?.closeMenu || "Close"}
          >
            <i className="fas fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            {i18n?.viewingCompany || "Viewing"}
          </p>
          <p className="mt-1 truncate text-[20px] font-bold tracking-tight text-slate-900">
            {companyCode || "—"}
          </p>
          {groupId ? (
            <p className="mt-0.5 text-[12px] font-semibold text-[#2f6bf6]">
              {i18n?.groupId || "Group"} · {groupId}
            </p>
          ) : null}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3" aria-label={i18n?.menu || "Menu"}>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/dashboard"}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-3 text-[14px] font-bold transition-colors ${
                  isActive ? "bg-[#eff4ff] text-[#2f6bf6]" : "text-slate-700"
                }`
              }
            >
              <i className={`fas ${item.icon} w-5 text-center text-[16px]`} aria-hidden="true" />
              <span>{i18n?.[item.key] || item.key}</span>
            </NavLink>
          ))}

          {companies.length > 1 ? (
            <div className="pt-3">
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {i18n?.company || "Company"}
              </p>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {companies.slice(0, 40).map((c) => {
                  const code = displayCompany(c);
                  const active = String(companyCode || "").toUpperCase() === code;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSwitchCompany?.(c.id);
                        onClose();
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-[13px] font-bold ${
                        active ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-700"
                      }`}
                    >
                      <span className="truncate">{code}</span>
                      {active ? <i className="fas fa-check text-[11px]" aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </nav>

        <div
          className="border-t border-slate-100 px-4 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 14px)" }}
        >
          <button
            type="button"
            onClick={() => {
              onClose();
              onLogout?.();
            }}
            className="tap-scale flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 py-3.5 text-[14px] font-bold text-rose-600"
          >
            <i className="fas fa-right-from-bracket" aria-hidden="true" />
            {i18n?.logout || "Logout"}
          </button>
        </div>
      </aside>
    </div>
  );
}

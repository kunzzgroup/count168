import PortalTooltip from "./PortalTooltip.jsx";

/**
 * Sidebar icon-only mode: menu label in portal tooltip.
 * @param {{
 *   label: string,
 *   enabled?: boolean,
 *   placement?: "top" | "below" | "right" | "auto-top",
 *   children: import("react").ReactNode,
 * }} props
 */
export default function SidebarMenuTooltip({
  label,
  enabled = true,
  placement = "right",
  children,
}) {
  return (
    <PortalTooltip
      content={label}
      enabled={enabled}
      placement={placement}
      showOnFocus={false}
    >
      {children}
    </PortalTooltip>
  );
}

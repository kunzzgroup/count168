import PortalTooltip from "./PortalTooltip.jsx";

/**
 * Sidebar icon-only mode: menu label in portal tooltip to the right of the item.
 * @param {{ label: string, enabled?: boolean, children: import("react").ReactNode }} props
 */
export default function SidebarMenuTooltip({ label, enabled = true, children }) {
  return (
    <PortalTooltip content={label} enabled={enabled} placement="right">
      {children}
    </PortalTooltip>
  );
}

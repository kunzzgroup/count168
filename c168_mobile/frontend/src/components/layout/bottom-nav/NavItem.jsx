import { motion } from "framer-motion";
import { NavLink } from "react-router-dom";
import { NAV_MOTION_DURATION, NAV_MOTION_EASE, navAvatarInitials } from "./navigationConfig.js";
import { triggerNavHaptic } from "./useHapticTap.js";

const iconTransition = {
  duration: NAV_MOTION_DURATION,
  ease: NAV_MOTION_EASE,
};

/**
 * Single bottom-nav destination — outlined when inactive, filled + scale when active.
 * @param {{ item: import('./navigationConfig.js').BottomNavItem, label: string, me?: object|null }} props
 */
export default function NavItem({ item, label, me }) {
  const displayName = me?.nickname || me?.username || me?.name || "";

  return (
    <NavLink
      to={item.to}
      end={Boolean(item.end)}
      aria-label={label}
      className="m-bottom-nav-item tap-instant"
      onPointerDown={() => triggerNavHaptic()}
    >
      {({ isActive }) => (
        <motion.span
          className="m-bottom-nav-item-inner"
          animate={{
            scale: isActive ? 1.12 : 1,
            opacity: isActive ? 1 : 0.42,
          }}
          transition={iconTransition}
        >
          {item.kind === "avatar" ? (
            <span
              className={`m-bottom-nav-avatar${isActive ? " is-active" : ""}`}
              aria-hidden="true"
            >
              {navAvatarInitials(displayName)}
            </span>
          ) : (
            <i
              className={`${isActive ? item.iconFill : item.iconOutline}${isActive ? " active-weight" : " inactive-weight"}`}
              aria-hidden="true"
            />
          )}
        </motion.span>
      )}
    </NavLink>
  );
}

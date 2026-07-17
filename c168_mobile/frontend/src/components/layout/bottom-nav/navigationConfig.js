import { matchPath } from "react-router-dom";
import {
  canAccessAccount,
  canAccessDashboard,
  canAccessTransaction,
} from "../../../utils/mobilePermissions.js";

/** @typedef {'icon' | 'avatar'} BottomNavItemKind */

/**
 * @typedef {Object} BottomNavItem
 * @property {string} id
 * @property {string} to
 * @property {boolean} [end]
 * @property {string} labelKey
 * @property {BottomNavItemKind} kind
 * @property {string} [iconOutline] Font Awesome classes (inactive)
 * @property {string} [iconFill] Font Awesome classes (active)
 */

/** Easing shared by Framer Motion transitions (Instagram-like, no bounce). */
export const NAV_MOTION_EASE = [0.22, 1, 0.36, 1];
export const NAV_MOTION_DURATION = 0.25;

/**
 * App routes → Instagram-style bottom nav items (permission-aware).
 * Maps Home / Transaction / Account / More to icon + avatar pattern.
 * @param {object|null|undefined} me
 * @returns {BottomNavItem[]}
 */
export function buildBottomNavItems(me) {
  /** @type {BottomNavItem[]} */
  const items = [];

  if (canAccessDashboard(me)) {
    items.push({
      id: "home",
      to: "/dashboard",
      end: true,
      labelKey: "navHome",
      kind: "icon",
      iconOutline: "far fa-house",
      iconFill: "fas fa-house",
    });
  }

  if (canAccessTransaction(me)) {
    items.push({
      id: "transaction",
      to: "/transaction",
      end: false,
      labelKey: "navTransaction",
      kind: "icon",
      iconOutline: "fas fa-money-bill-transfer",
      iconFill: "fas fa-money-bill-transfer",
    });
  }

  if (canAccessAccount(me)) {
    items.push({
      id: "account",
      to: "/account",
      end: false,
      labelKey: "navAccount",
      kind: "icon",
      iconOutline: "far fa-address-book",
      iconFill: "fas fa-address-book",
    });
  }

  items.push({
    id: "more",
    to: "/more",
    end: false,
    labelKey: "navMore",
    kind: "avatar",
  });

  return items;
}

/**
 * @param {string} pathname
 * @param {BottomNavItem} item
 */
export function isBottomNavItemActive(pathname, item) {
  if (item.to === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return Boolean(matchPath({ path: `${item.to}/*`, end: false }, pathname));
}

/** @param {string} name */
export function navAvatarInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

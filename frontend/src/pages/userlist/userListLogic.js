/** User list page — pure helpers (parity with js/userlist.js + userlist.php) */

export const PAGE_SIZE = 20;

export const ROLE_HIERARCHY = {
  owner: 0,
  partnership: 1,
  admin: 2,
  manager: 3,
  supervisor: 4,
  accountant: 5,
  audit: 6,
  "customer service": 7,
  company: 8,
};

/** Role options in `<select>` order (matches userlist.php) */
export const ALL_ROLE_OPTIONS = [
  { value: "partnership", label: "Partnership" },
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "supervisor", label: "Supervisor" },
  { value: "accountant", label: "Accountant" },
  { value: "audit", label: "Audit" },
  { value: "customer service", label: "Customer Service" },
  { value: "company", label: "Company" },
];

export const PERMISSION_KEYS = ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"];

export const PERMISSION_ICONS = {
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  admin: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z",
  account: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  ownership: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  process: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  datacapture: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z",
  payment: "M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z",
  report: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 2 2h8c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  maintenance: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
};

export function normRole(r) {
  return String(r || "").trim().toLowerCase();
}

export function getCurrentUserRolePermissions(currentUserRole) {
  const rolePermissions = {
    owner: ["home", "admin", "account", "ownership", "process", "datacapture", "payment", "report", "maintenance"],
    admin: ["home", "admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    manager: ["admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    supervisor: ["admin", "account", "process", "datacapture", "payment", "report"],
    accountant: ["payment", "report", "maintenance"],
    audit: ["payment", "report", "maintenance"],
    "customer service": ["account", "process", "datacapture", "payment", "report"],
  };
  return rolePermissions[normRole(currentUserRole)] || [];
}

export function getRoleTemplateSidebarList(role) {
  if (!role) return [];
  const rolePermissions = {
    partnership: [],
    admin: ["home", "admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    manager: ["admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    supervisor: ["admin", "account", "process", "datacapture", "payment", "report"],
    accountant: ["payment", "report", "maintenance"],
    audit: ["payment", "report", "maintenance"],
    "customer service": ["account", "process", "datacapture", "payment", "report"],
  };
  return rolePermissions[normRole(role)] || [];
}

export function getAvailableRolesForCreation(currentUserRole) {
  const currentLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  if (currentLevel >= 4) return [];
  return ALL_ROLE_OPTIONS.filter((role) => {
    const roleLevel = ROLE_HIERARCHY[role.value] ?? 999;
    return roleLevel > currentLevel;
  });
}

export function getAvailableRolesForEdit(currentUserRole, editingUserRole) {
  const currentLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  const editingUserLevel = ROLE_HIERARCHY[normRole(editingUserRole)] ?? 999;
  if (currentLevel >= 4) return [];
  if (editingUserLevel <= currentLevel) return [];
  return ALL_ROLE_OPTIONS.filter((role) => {
    const roleLevel = ROLE_HIERARCHY[role.value] ?? 999;
    return roleLevel > currentLevel;
  });
}

export function getFinalPermissionsForCreation(selectedRole, manuallySelected, currentUserRole) {
  const cur = normRole(currentUserRole);
  const currentUserPermissions = getCurrentUserRolePermissions(cur);
  const rolePerms = {
    admin: ["home", "admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    manager: ["admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
    supervisor: ["admin", "account", "process", "datacapture", "payment", "report"],
    accountant: ["payment", "report", "maintenance"],
    audit: ["payment", "report", "maintenance"],
    "customer service": ["account", "process", "datacapture", "payment", "report"],
  };
  const sr = normRole(selectedRole);
  if (!sr) {
    return manuallySelected.filter((perm) => currentUserPermissions.includes(perm));
  }
  const defaultPermissions = rolePerms[sr] ?? [];
  const manual = new Set(manuallySelected);
  return defaultPermissions.filter((perm) => {
    if (currentUserPermissions.includes(perm)) return manual.has(perm);
    return true;
  });
}

/**
 * Row capabilities (matches userlist.php card rules).
 * @param {object} row — user row with id, role, status, is_owner_shadow
 */
export function computeRowCapabilities(row, currentUserId, currentUserRole) {
  const targetRole = normRole(row.role);
  const isOwnerShadow = !!row.is_owner_shadow;
  const targetUserId = Number(row.id);
  const currentLevel = ROLE_HIERARCHY[normRole(currentUserRole)] ?? 999;
  const targetLevel = ROLE_HIERARCHY[targetRole] ?? 999;
  const isSelf = currentUserId && targetUserId === Number(currentUserId);
  const isSameLevel = currentLevel === targetLevel && !isSelf;
  const isHigherLevel = targetLevel < currentLevel;
  const lowPrivilegeRoles = ["manager", "supervisor", "accountant", "audit", "customer service"];
  const isLowPrivilegeUser = lowPrivilegeRoles.includes(normRole(currentUserRole));
  const isAdminUser = targetRole === "admin";
  const isOwnerUser = targetRole === "owner";

  let canEditDelete = true;
  let canDelete = true;
  let canToggleStatus = true;

  if (isSelf) {
    canDelete = false;
  } else if (isOwnerShadow) {
    canEditDelete = normRole(currentUserRole) === "owner";
    canDelete = canEditDelete;
  } else if (isLowPrivilegeUser && (isAdminUser || isOwnerUser)) {
    canEditDelete = false;
    canDelete = false;
  } else if (isSameLevel) {
    canDelete = false;
  } else if (isHigherLevel) {
    canDelete = false;
  }

  canToggleStatus = canEditDelete && !isSelf;

  return { canEditDelete, canDelete, canToggleStatus, isSelf, isSameLevel, isHigherLevel, isOwnerShadow };
}

export function formatLastLogin(raw) {
  if (!raw) return "-";
  const s = String(raw).trim();
  if (!s) return "-";
  const d = new Date(s.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

export function applyUserFilters(users, { search, showInactive, showAll, viewerRole }) {
  const vr = normRole(viewerRole);
  let rows = users.map((u) => ({ ...u }));
  if (vr !== "owner") {
    rows = rows.filter((u) => normRole(u.role) !== "partnership");
  }
  const q = search.trim().toLowerCase();
  if (q) {
    rows = rows.filter((u) => `${u.login_id || ""} ${u.name || ""}`.toLowerCase().includes(q));
  }
  if (showAll) return rows;
  if (showInactive) {
    rows = rows.filter((u) => normRole(u.status) === "inactive");
  } else {
    rows = rows.filter((u) => normRole(u.status) === "active");
  }
  return rows;
}

export function sortUsers(rows, sortColumn, sortDirection) {
  const dir = sortDirection === "desc" ? -1 : 1;
  const copy = [...rows];
  if (sortColumn === "loginId") {
    copy.sort((a, b) => {
      if (a.is_owner_shadow && !b.is_owner_shadow) return -1;
      if (!a.is_owner_shadow && b.is_owner_shadow) return 1;
      const aKey = String(a.login_id || "").toLowerCase();
      const bKey = String(b.login_id || "").toLowerCase();
      let result = 0;
      if (aKey < bKey) result = -1;
      else if (aKey > bKey) result = 1;
      else {
        const aName = String(a.name || "").toLowerCase();
        const bName = String(b.name || "").toLowerCase();
        if (aName < bName) result = -1;
        else if (aName > bName) result = 1;
      }
      return result * dir;
    });
  } else if (sortColumn === "role") {
    copy.sort((a, b) => {
      if (a.is_owner_shadow && !b.is_owner_shadow) return -1;
      if (!a.is_owner_shadow && b.is_owner_shadow) return 1;
      const aKey = normRole(a.role);
      const bKey = normRole(b.role);
      let result = 0;
      if (aKey < bKey) result = -1;
      else if (aKey > bKey) result = 1;
      else {
        const al = String(a.login_id || "").toLowerCase();
        const bl = String(b.login_id || "").toLowerCase();
        if (al < bl) result = -1;
        else if (al > bl) result = 1;
      }
      return result * dir;
    });
  }
  return copy;
}

export function getDeleteCheckboxState(row, caps) {
  if (normRole(row.status) === "active") return { show: false };
  if (!caps.canDelete) return { show: true, disabled: true, title: caps.isSelf ? "You cannot delete your own account" : "No permission to delete" };
  return { show: true, disabled: false, title: "" };
}

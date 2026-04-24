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

export const PERMISSION_KEYS = ["home", "admin", "account", "process", "datacapture", "payment", "report", "maintenance"];

export function normRole(r) {
  return String(r || "").trim().toLowerCase();
}

export function getCurrentUserRolePermissions(currentUserRole) {
  const rolePermissions = {
    owner: ["home", "admin", "account", "process", "datacapture", "payment", "report", "maintenance"],
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
  if (!showInactive) {
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

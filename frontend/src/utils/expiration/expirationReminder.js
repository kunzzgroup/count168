import { getExpirationReminderText } from "../../translateFile/shell/expirationReminderTranslate.js";

const STORAGE_KEY = "ec_exp_reminder_dismissed";
export const EXPIRATION_BELL_ITEM_ID = "__expiration_reminder__";

/** 到期前三个提醒节点：≤15 天、≤7 天、≤3 天（各弹一次） */
export function getActiveExpirationTier(daysLeft) {
  if (daysLeft == null || daysLeft < 0) return null;
  if (daysLeft <= 3) return "d3";
  if (daysLeft <= 7) return "d7";
  if (daysLeft <= 15) return "d15";
  return null;
}

export function getDaysUntilExpiration(expirationDate) {
  if (!expirationDate) return null;
  const expStr = String(expirationDate).split(" ")[0];
  const exp = new Date(expStr);
  if (Number.isNaN(exp.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  return Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
}

function readDismissedMap() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeDismissedMap(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getExpirationReminderStorageKey(companyId, expirationDate) {
  const exp = String(expirationDate || "").split(" ")[0];
  return `${companyId}_${exp}`;
}

export function isExpirationTierDismissed(companyId, expirationDate, tier) {
  if (!companyId || !expirationDate || !tier) return true;
  const map = readDismissedMap();
  const key = getExpirationReminderStorageKey(companyId, expirationDate);
  const tiers = Array.isArray(map[key]) ? map[key] : [];
  return tiers.includes(tier);
}

export function dismissExpirationTier(companyId, expirationDate, tier) {
  if (!companyId || !expirationDate || !tier) return;
  const map = readDismissedMap();
  const key = getExpirationReminderStorageKey(companyId, expirationDate);
  const tiers = Array.isArray(map[key]) ? [...map[key]] : [];
  if (!tiers.includes(tier)) tiers.push(tier);
  map[key] = tiers;
  writeDismissedMap(map);
}

function formatExpirationDate(expirationDate, lang) {
  const expStr = String(expirationDate || "").split(" ")[0];
  const parts = expStr.split("-");
  if (parts.length !== 3) return expStr;
  const [y, m, d] = parts;
  return lang === "zh" ? `${y}年${Number(m)}月${Number(d)}日` : `${d}/${m}/${y}`;
}

export function resolveExpirationReminder(me, lang = "en") {
  if (!me) return null;
  const companyCode = String(me.company_code || "").toUpperCase();
  if (companyCode === "C168") return null;

  const expirationDate = me.expiration_date || null;
  if (!expirationDate) return null;

  const daysLeft =
    me.days_until_expiration != null
      ? Number(me.days_until_expiration)
      : getDaysUntilExpiration(expirationDate);
  if (daysLeft == null || daysLeft < 0) return null;

  const tier = getActiveExpirationTier(daysLeft);
  if (!tier) return null;

  const dateLabel = formatExpirationDate(expirationDate, lang);
  let messageKey = "expReminderD15";
  if (tier === "d7") messageKey = "expReminderD7";
  else if (tier === "d3") {
    if (daysLeft === 0) messageKey = "expReminderToday";
    else if (daysLeft === 1) messageKey = "expReminderD1";
    else messageKey = "expReminderD3";
  }

  const message = getExpirationReminderText(lang, messageKey, {
    days: daysLeft,
    date: dateLabel,
  });
  const title =
    tier === "d3"
      ? getExpirationReminderText(lang, "expReminderTitleUrgent")
      : getExpirationReminderText(lang, "expReminderTitle");

  const companyId = me.company_id;
  const shouldShowPopup = !isExpirationTierDismissed(companyId, expirationDate, tier);

  return {
    tier,
    daysLeft,
    expirationDate,
    companyId,
    title,
    message,
    shouldShowPopup,
    bellItem: {
      id: EXPIRATION_BELL_ITEM_ID,
      title: getExpirationReminderText(lang, "expReminderBellTitle"),
      content: message,
      created_at: dateLabel,
      isExpirationReminder: true,
    },
  };
}

export function mergeExpirationBellItem(announcements, bellItem) {
  const list = Array.isArray(announcements) ? announcements : [];
  if (!bellItem) return list;
  const filtered = list.filter((a) => a?.id !== EXPIRATION_BELL_ITEM_ID && !a?.isExpirationReminder);
  return [bellItem, ...filtered];
}

import { interpolate } from "../shared/i18nHelpers.js";

export const EXPIRATION_REMINDER_I18N = {
  en: {
    expReminderTitle: "Subscription Expiring Soon",
    expReminderTitleUrgent: "Subscription Expiring Very Soon",
    expReminderBellTitle: "Company subscription expiring soon",
    expReminderD15: "Your company subscription expires in {days} days (on {date}). Please contact Customer Service to renew.",
    expReminderD7: "Your company subscription expires in {days} days. Please renew soon to avoid service interruption.",
    expReminderD3: "Your company subscription expires in {days} day(s) (on {date}). Please contact Customer Service immediately.",
    expReminderD1: "Your company subscription expires tomorrow (on {date}). Please contact Customer Service immediately.",
    expReminderToday: "Your company subscription expires today. Please contact Customer Service immediately.",
    expReminderConfirm: "Got it",
    expReminderAutoRenew: "Set Auto Renew",
  },
  zh: {
    expReminderTitle: "订阅即将到期",
    expReminderTitleUrgent: "订阅即将到期（紧急）",
    expReminderBellTitle: "公司订阅即将到期",
    expReminderD15: "您的公司订阅将在 {days} 天后到期（{date}），请联系客服续费。",
    expReminderD7: "您的公司订阅将在 {days} 天后到期，请尽快续费以免影响使用。",
    expReminderD3: "您的公司订阅将在 {days} 天后到期（{date}），请立即联系客服续费。",
    expReminderD1: "您的公司订阅将于明天到期（{date}），请立即联系客服续费。",
    expReminderToday: "您的公司订阅今日到期，请立即联系客服续费。",
    expReminderConfirm: "知道了",
    expReminderAutoRenew: "设置自动续费",
  },
};

export function getExpirationReminderText(lang, key, params = {}) {
  const locale = lang === "zh" ? "zh" : "en";
  const raw = EXPIRATION_REMINDER_I18N[locale]?.[key] ?? EXPIRATION_REMINDER_I18N.en[key] ?? key;
  return interpolate(raw, params);
}

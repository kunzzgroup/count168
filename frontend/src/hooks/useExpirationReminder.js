import { useCallback, useEffect, useMemo, useState } from "react";
import {
  dismissExpirationTier,
  mergeExpirationBellItem,
  resolveExpirationReminder,
} from "../utils/expiration/expirationReminder.js";
import { getExpirationReminderText } from "../translateFile/shell/expirationReminderTranslate.js";

/**
 * 到期提醒：铃铛通知 + 登录/会话弹窗（15 天 / 7 天 / 最后 3 天各一次）
 */
export function useExpirationReminder(me, lang = "en") {
  const reminder = useMemo(() => resolveExpirationReminder(me, lang), [me, lang]);
  const [showModal, setShowModal] = useState(false);
  const [bellRead, setBellRead] = useState(false);

  useEffect(() => {
    if (reminder?.shouldShowPopup) {
      setShowModal(true);
    } else {
      setShowModal(false);
    }
  }, [reminder?.shouldShowPopup, reminder?.tier, reminder?.expirationDate, reminder?.companyId]);

  useEffect(() => {
    setBellRead(false);
  }, [reminder?.tier, reminder?.expirationDate, reminder?.companyId]);

  const dismissModal = useCallback(() => {
    if (reminder) {
      dismissExpirationTier(reminder.companyId, reminder.expirationDate, reminder.tier);
    }
    setShowModal(false);
  }, [reminder]);

  const mergeAnnouncements = useCallback(
    (announcements) => mergeExpirationBellItem(announcements, reminder?.bellItem ?? null),
    [reminder?.bellItem],
  );

  const onBellOpen = useCallback(() => {
    setBellRead(true);
  }, []);

  const modalI18n = useMemo(
    () => ({
      confirm: getExpirationReminderText(lang, "expReminderConfirm"),
    }),
    [lang],
  );

  return {
    reminder,
    showModal,
    dismissModal,
    modalTitle: reminder?.title ?? "",
    modalMessage: reminder?.message ?? "",
    modalI18n,
    mergeAnnouncements,
    hasBellBadge: Boolean(reminder?.bellItem) && !bellRead,
    onBellOpen,
  };
}

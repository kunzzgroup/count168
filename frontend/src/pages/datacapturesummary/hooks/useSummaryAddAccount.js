import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Phase 10: React owns Add Account modal visibility.
 * Legacy initAddAccountModalAfterMount / form submit handle behavior.
 */
export function useSummaryAddAccount({ scriptsReady }) {
  const [open, setOpen] = useState(false);
  const initGenerationRef = useRef(0);

  const resetAddAccountModalDom = useCallback(() => {
    if (typeof window.__SUMMARY_RESET_ADD_ACCOUNT_MODAL__ === "function") {
      window.__SUMMARY_RESET_ADD_ACCOUNT_MODAL__();
    }
  }, []);

  const closeAddAccount = useCallback(() => {
    resetAddAccountModalDom();
    setOpen(false);
  }, [resetAddAccountModalDom]);

  const showAddAccount = useCallback(() => {
    setOpen(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !scriptsReady) return undefined;

    const generation = initGenerationRef.current + 1;
    initGenerationRef.current = generation;

    const runInit = async () => {
      if (initGenerationRef.current !== generation) return;

      if (typeof window.initAddAccountModalAfterMount === "function") {
        window.initAddAccountModalAfterMount();
      }

      if (typeof window.loadAddAccountModalData === "function") {
        await window.loadAddAccountModalData();
      }
    };

    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        runInit();
      });
    });

    return () => {
      cancelAnimationFrame(id);
    };
  }, [open, scriptsReady]);

  useEffect(() => {
    if (!scriptsReady) return undefined;

    window.__SUMMARY_REACT_SHOW_ADD_ACCOUNT__ = showAddAccount;
    window.__SUMMARY_REACT_CLOSE_ADD_ACCOUNT__ = closeAddAccount;
    window.showAddAccountModal = showAddAccount;
    window.closeAddModal = closeAddAccount;

    return () => {
      delete window.__SUMMARY_REACT_SHOW_ADD_ACCOUNT__;
      delete window.__SUMMARY_REACT_CLOSE_ADD_ACCOUNT__;
      delete window.showAddAccountModal;
      delete window.closeAddModal;
    };
  }, [scriptsReady, showAddAccount, closeAddAccount]);

  return {
    open,
    closeAddAccount,
    showAddAccount,
  };
}

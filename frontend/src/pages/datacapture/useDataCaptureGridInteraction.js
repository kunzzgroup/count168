import { useEffect, useLayoutEffect } from "react";
import { handleDocumentGridKeydown } from "./dataCaptureGridDocumentKeyboard.js";
import { handleDocumentGridOutsideClick } from "./dataCaptureGridOutsideClick.js";
import { attachGridMouseDelegation } from "./dataCaptureGridMouseDelegation.js";
import { handleCellKeydown } from "./dataCaptureGridCellKeydown.js";
import { handleCellClick } from "./dataCaptureGridCellClick.js";
import {
  moveCaretToClickPosition,
  moveCaretToEnd,
  setActiveCell,
  setActiveCellCore,
  setActiveCellWithoutFocus,
} from "./dataCaptureGridActiveCell.js";

import {
  hideContextMenu,
  showColumnContextMenu,
  showContextMenu,
  showRowContextMenu,
  updateActiveContextMenuPosition,
} from "./dataCaptureContextMenu.js";

/**
 * Phase 5a/5b: SPA-owned grid interaction + context menus.
 */
export function useDataCaptureGridInteraction(scriptsReady) {
  useLayoutEffect(() => {
    window.__DC_SET_ACTIVE_CELL_CORE_REACT__ = setActiveCellCore;
    window.__DC_SET_ACTIVE_CELL_REACT__ = setActiveCell;
    window.__DC_SET_ACTIVE_CELL_WITHOUT_FOCUS_REACT__ = setActiveCellWithoutFocus;
    window.__DC_MOVE_CARET_TO_END_REACT__ = moveCaretToEnd;
    window.__DC_MOVE_CARET_TO_CLICK_REACT__ = moveCaretToClickPosition;
    window.__DC_HANDLE_CELL_CLICK_REACT__ = handleCellClick;
    window.__DC_HANDLE_CELL_KEYDOWN_REACT__ = handleCellKeydown;
    window.__DC_SET_ACTIVE_CELL__ = setActiveCell;
    window.__DC_SET_ACTIVE_CELL_WITHOUT_FOCUS__ = setActiveCellWithoutFocus;
    window.__DC_MOVE_CARET_TO_END__ = moveCaretToEnd;

    window.__DC_SHOW_CONTEXT_MENU_REACT__ = showContextMenu;
    window.__DC_SHOW_COLUMN_CONTEXT_MENU_REACT__ = showColumnContextMenu;
    window.__DC_SHOW_ROW_CONTEXT_MENU_REACT__ = showRowContextMenu;
    window.__DC_HIDE_CONTEXT_MENU__ = hideContextMenu;
    window.__DC_UPDATE_CONTEXT_MENU_POSITION__ = updateActiveContextMenuPosition;
    window.updateActiveContextMenuPosition = updateActiveContextMenuPosition;

    return () => {
      delete window.__DC_SET_ACTIVE_CELL_CORE_REACT__;
      delete window.__DC_SET_ACTIVE_CELL_REACT__;
      delete window.__DC_SET_ACTIVE_CELL_WITHOUT_FOCUS_REACT__;
      delete window.__DC_MOVE_CARET_TO_END_REACT__;
      delete window.__DC_MOVE_CARET_TO_CLICK_REACT__;
      delete window.__DC_HANDLE_CELL_CLICK_REACT__;
      delete window.__DC_HANDLE_CELL_KEYDOWN_REACT__;
      delete window.__DC_SHOW_CONTEXT_MENU_REACT__;
      delete window.__DC_SHOW_COLUMN_CONTEXT_MENU_REACT__;
      delete window.__DC_SHOW_ROW_CONTEXT_MENU_REACT__;
      delete window.__DC_HIDE_CONTEXT_MENU__;
      delete window.__DC_UPDATE_CONTEXT_MENU_POSITION__;
      if (window.updateActiveContextMenuPosition === updateActiveContextMenuPosition) {
        delete window.updateActiveContextMenuPosition;
      }
    };
  }, []);

  useEffect(() => {
    if (!scriptsReady) return;

    document.addEventListener("keydown", handleDocumentGridKeydown);
    document.addEventListener("click", handleDocumentGridOutsideClick);

    let detachMouse = () => {};
    let pollId = null;

    const attachMouse = () => {
      const dataTable = document.getElementById("dataTable");
      if (!dataTable) return false;
      detachMouse = attachGridMouseDelegation(dataTable);
      return true;
    };

    if (!attachMouse()) {
      pollId = setInterval(() => {
        if (attachMouse()) clearInterval(pollId);
      }, 200);
    }

    return () => {
      clearInterval(pollId);
      detachMouse();
      document.removeEventListener("keydown", handleDocumentGridKeydown);
      document.removeEventListener("click", handleDocumentGridOutsideClick);
    };
  }, [scriptsReady]);
}

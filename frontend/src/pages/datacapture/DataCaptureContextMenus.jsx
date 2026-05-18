import { memo } from "react";

/**
 * Legacy positions these with inline styles; never re-render after mount so React does not clear display/position.
 */
function DataCaptureContextMenus() {
  return (
    <>
      <div id="contextMenu" className="context-menu">
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.copySelectedCells?.(); }}>
          <span>📋 Copy</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.pasteToSelectedCells?.(); }}>
          <span>📄 Paste</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.clearSelectedCells?.(); }}>
          <span>🗑️ Clear</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => { e.stopPropagation(); window.showDeleteDialog?.(e); }}>
          <span>🗑️ Delete</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={(e) => window.selectAllCells?.(e)}>
          <span>☑️ Select All</span>
        </div>
      </div>

      <div id="columnContextMenu" className="context-menu">
        <div className="context-menu-item" role="presentation" onClick={() => window.insertColumnLeft?.()}>
          <span>➕ Insert 1 column left</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.insertColumnRight?.()}>
          <span>➕ Insert 1 column right</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.deleteColumn?.()}>
          <span>🗑️ Delete column</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.clearColumn?.()}>
          <span>❌ Clear column</span>
        </div>
      </div>

      <div id="rowContextMenu" className="context-menu">
        <div className="context-menu-item" role="presentation" onClick={() => window.insertRowAbove?.()}>
          <span>➕ Insert 1 row above</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.insertRowBelow?.()}>
          <span>➕ Insert 1 row below</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.deleteRow?.()}>
          <span>🗑️ Delete row</span>
        </div>
        <div className="context-menu-item" role="presentation" onClick={() => window.clearRow?.()}>
          <span>❌ Clear row</span>
        </div>
      </div>
    </>
  );
}

export default memo(DataCaptureContextMenus, () => true);

import { memo } from "react";

/**
 * Stable grid shell — React owns DOM structure; legacy `buildDataCaptureTable` fills rows/cells.
 * Format preview + paste area IDs must match legacy selectors.
 */
function DataCaptureGrid() {
  return (
    <>
      <table className="excel-table" id="dataTable">
        <thead id="tableHeader">
          <tr>
            <th />
          </tr>
        </thead>
        <tbody id="tableBody" />
      </table>
      <div id="tablePreviewFormat" className="table-preview-format" style={{ display: "none" }}>
        <iframe
          id="tablePreviewFrameFormat"
          className="table-preview-frame-format"
          title="Format Table Preview"
        />
      </div>
      <div
        id="pasteAreaFormat"
        className="paste-area-format"
        style={{ display: "none" }}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="在此直接粘贴整张表格（支持Excel/Sheets复制的表格格式）..."
      />
    </>
  );
}

export default memo(DataCaptureGrid, () => true);

import { memo, useCallback } from "react";
import { useDataCaptureContext } from "../context/DataCaptureContext.jsx";
import { useDataCapturePureReactGridInteraction } from "../hooks/useDataCapturePureReactGridInteraction.js";
import DataCaptureGridCell from "./DataCaptureGridCell.jsx";

function attachColumnHeaderListeners(header) {
  if (!header) return;
  header.style.cursor = "pointer";
}

function attachRowHeaderListeners(rowHeader) {
  if (!rowHeader) return;
  rowHeader.style.cursor = "pointer";
}

function DataCaptureGrid({ engineReady = false }) {
  const { grid, gridVersion } = useDataCaptureContext();
  const gridEvents = useDataCapturePureReactGridInteraction(engineReady);

  const bindColumnHeader = useCallback((el) => {
    attachColumnHeaderListeners(el);
  }, []);

  const bindRowHeader = useCallback((el) => {
    attachRowHeaderListeners(el);
  }, []);

  if (!grid) {
    return (
      <table className="excel-table" id="dataTable">
        <thead id="tableHeader">
          <tr>
            <th />
          </tr>
        </thead>
        <tbody id="tableBody" />
      </table>
    );
  }

  return (
    <table className="excel-table" id="dataTable">
      <thead id="tableHeader">
        <tr>
          <th />
          {Array.from({ length: grid.cols }, (_, colIndex) => (
            <th
              key={`col-h-${colIndex}`}
              ref={bindColumnHeader}
              onMouseDown={gridEvents.onColumnHeaderMouseDown}
              onMouseOver={gridEvents.onColumnHeaderMouseOver}
              onClick={gridEvents.onColumnHeaderClick}
              onContextMenu={gridEvents.onColumnHeaderContextMenu}
            >
              {colIndex + 1}
            </th>
          ))}
        </tr>
      </thead>
      <tbody id="tableBody" key={`grid-${grid.rows}-${grid.cols}`}>
        {grid.cells.map((row, rowIndex) => (
          <tr key={`row-${rowIndex}`}>
            <td
              ref={bindRowHeader}
              className="row-header"
              onMouseDown={gridEvents.onRowHeaderMouseDown}
              onMouseOver={gridEvents.onRowHeaderMouseOver}
              onClick={gridEvents.onRowHeaderClick}
              onContextMenu={gridEvents.onRowHeaderContextMenu}
            >
              {grid.rowLabels[rowIndex]}
            </td>
            {row.map((cell, colIndex) => (
              <DataCaptureGridCell
                key={`cell-${rowIndex}-${colIndex}`}
                rowIndex={rowIndex}
                colIndex={colIndex}
                cell={cell}
                gridVersion={gridVersion}
                onMouseDown={gridEvents.onCellMouseDown}
                onMouseOver={gridEvents.onCellMouseOver}
                onClick={gridEvents.onCellClick}
                onKeyDown={gridEvents.onCellKeyDown}
                onContextMenu={gridEvents.onCellContextMenu}
              />
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default memo(DataCaptureGrid);

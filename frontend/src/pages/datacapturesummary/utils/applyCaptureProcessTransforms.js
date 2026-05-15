/** Mirrors js/datacapturesummary.js applyTextTransformations / applyTransformationsToTableData */

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function applyTextTransformations(text, removeWord, replaceWordFrom, replaceWordTo) {
  if (!text || typeof text !== "string") {
    return text;
  }

  let result = text;

  if (removeWord && removeWord.trim() !== "") {
    const wordsToRemove = removeWord
      .split(";")
      .map((word) => word.trim())
      .filter((word) => word !== "");
    wordsToRemove.forEach((word) => {
      const escapedRemoveWord = escapeRegex(word);
      const removeRegex = new RegExp(escapedRemoveWord, "gi");
      result = result.replace(removeRegex, "");
    });
  }

  if (replaceWordFrom && replaceWordFrom.trim() !== "" && replaceWordTo !== undefined) {
    const escapedReplaceWord = escapeRegex(replaceWordFrom.trim());
    const replaceRegex = new RegExp(escapedReplaceWord, "gi");
    result = result.replace(replaceRegex, replaceWordTo);
  }

  return result.trim();
}

/**
 * Deep-clone captured table JSON and transform all data cell values (legacy load path).
 *
 * @param {object} tableData
 * @param {string} removeWord
 * @param {string} replaceWordFrom
 * @param {string} replaceWordTo
 */
export function applyTransformationsToCapturedTable(tableData, removeWord, replaceWordFrom, replaceWordTo) {
  const transformedData = JSON.parse(JSON.stringify(tableData || {}));

  const rows = Array.isArray(transformedData.rows) ? transformedData.rows : [];
  rows.forEach((row) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell) => {
      if (cell?.type === "data" && cell.value != null && cell.value !== "") {
        cell.value = applyTextTransformations(String(cell.value), removeWord, replaceWordFrom, replaceWordTo);
      }
    });
  });

  return transformedData;
}

/**
 * Reads remove/replace fields from capturedProcessData (camelCase or snake_case).
 */
export function pickProcessWordTransforms(processData) {
  if (!processData || typeof processData !== "object") {
    return { removeWord: "", replaceWordFrom: "", replaceWordTo: "" };
  }
  const removeWord = processData.removeWord ?? processData.remove_word ?? "";
  const replaceWordFrom = processData.replaceWordFrom ?? processData.replace_word_from ?? "";
  const replaceWordTo = processData.replaceWordTo ?? processData.replace_word_to ?? "";
  return {
    removeWord: String(removeWord ?? ""),
    replaceWordFrom: String(replaceWordFrom ?? ""),
    replaceWordTo: replaceWordTo != null ? String(replaceWordTo) : "",
  };
}

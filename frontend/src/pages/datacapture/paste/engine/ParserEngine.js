import { HtmlTableParser } from "./plugins/HtmlTableParser.js";
import { RoleGridParser } from "./plugins/RoleGridParser.js";
import { MaterialCdkParser } from "./plugins/MaterialCdkParser.js";
import { VirtualDomGridParser } from "./plugins/VirtualDomGridParser.js";
import { ExcelTsvParser } from "./plugins/ExcelTsvParser.js";
import { PlainTextMatrixParser } from "./plugins/PlainTextMatrixParser.js";

const DEFAULT_PLUGINS = [
  HtmlTableParser,
  MaterialCdkParser,
  RoleGridParser,
  ExcelTsvParser,
  VirtualDomGridParser,
  PlainTextMatrixParser,
];

/**
 * ParserEngine — plugin score selection (structure signals only).
 */
export class ParserEngine {
  /** @param {Array<{ id: string, priority: number, canParse: Function, parse: Function }>} [plugins] */
  constructor(plugins = DEFAULT_PLUGINS) {
    this.plugins = [...plugins].sort((a, b) => b.priority - a.priority);
  }

  /**
   * @param {{ html?: string, plain?: string, preferred?: string }} content
   * @returns {{ headers: string[], rows: string[][], meta: object }}
   */
  parse(content) {
    let best = null;

    for (const plugin of this.plugins) {
      let score = 0;
      try {
        score = Number(plugin.canParse(content)) || 0;
      } catch {
        score = 0;
      }
      if (score < 0.35) continue;

      let table = null;
      try {
        table = plugin.parse(content);
      } catch (err) {
        console.warn(`[ParserEngine] ${plugin.id} failed:`, err);
        continue;
      }
      if (!table?.rows?.length) continue;

      const combined = score + plugin.priority / 1000;
      if (!best || combined > best.combined) {
        best = {
          combined,
          score,
          table: {
            headers: Array.isArray(table.headers) ? table.headers : [],
            rows: table.rows,
            meta: {
              ...(table.meta || {}),
              parserId: plugin.id,
              parseScore: score,
            },
          },
        };
      }
    }

    if (!best) {
      const err = new Error("NO_TABULAR_STRUCTURE");
      err.code = "NO_TABULAR_STRUCTURE";
      throw err;
    }
    return best.table;
  }
}

export const parserEngine = new ParserEngine();

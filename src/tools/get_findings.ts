import { readFile } from "node:fs/promises";
import type { RawScanResult } from "../veracode/types.js";
import { normalizeFinding, filterFindings } from "../veracode/parsers.js";

export async function executeGetFindings(args: {
  results_path: string;
  min_severity?: number;
  cwe_ids?: string[];
}) {
  let content: string;
  try {
    content = await readFile(args.results_path, "utf-8");
  } catch {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "error",
            message: `Cannot read results file: ${args.results_path}. Run scan_file first.`,
          }),
        },
      ],
    };
  }

  let raw: RawScanResult;
  try {
    raw = JSON.parse(content);
  } catch {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "error",
            message: "Results file contains invalid JSON.",
          }),
        },
      ],
    };
  }

  const all = (raw.findings ?? []).map(normalizeFinding);
  const filtered = filterFindings(all, args.min_severity, args.cwe_ids);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            status: "ok",
            total: all.length,
            returned: filtered.length,
            min_severity: args.min_severity,
            cwe_filter: args.cwe_ids ?? [],
            findings: filtered,
          },
          null,
          2
        ),
      },
    ],
  };
}

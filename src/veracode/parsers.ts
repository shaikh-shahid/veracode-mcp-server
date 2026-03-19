import { readFile } from "node:fs/promises";
import type {
  RawScanResult,
  RawFinding,
  NormalizedFinding,
  ScanSummary,
} from "./types.js";

const SEVERITY_LABELS: Record<number, string> = {
  5: "Very High",
  4: "High",
  3: "Medium",
  2: "Low",
  1: "Very Low",
  0: "Informational",
};

export function normalizeFinding(raw: RawFinding): NormalizedFinding {
  const src = raw.files?.source_file;
  return {
    issue_id: raw.issue_id,
    severity: raw.severity,
    severity_label: SEVERITY_LABELS[raw.severity] ?? `Unknown (${raw.severity})`,
    cwe_id: raw.cwe_id,
    title: raw.title,
    issue_type: raw.issue_type,
    file: src?.file ?? "unknown",
    line: src?.line ?? 0,
    function_name: src?.function_name ?? "unknown",
    description: raw.display_text,
    flaw_details_link: raw.flaw_details_link,
  };
}

export async function parseResultsFile(
  resultsPath: string,
  scanRunId: string
): Promise<ScanSummary> {
  let raw: RawScanResult;
  try {
    const content = await readFile(resultsPath, "utf-8");
    raw = JSON.parse(content);
  } catch {
    return {
      scan_run_id: scanRunId,
      results_path: resultsPath,
      status: "failed",
      total_findings: 0,
      findings_by_severity: {},
      findings: [],
    };
  }

  const findings = (raw.findings ?? []).map(normalizeFinding);
  const bySeverity: Record<string, number> = {};
  for (const f of findings) {
    bySeverity[f.severity_label] = (bySeverity[f.severity_label] ?? 0) + 1;
  }

  return {
    scan_run_id: scanRunId,
    results_path: resultsPath,
    status: "completed",
    total_findings: findings.length,
    findings_by_severity: bySeverity,
    findings,
  };
}

export function filterFindings(
  findings: NormalizedFinding[],
  minSeverity?: number,
  cweIds?: string[]
): NormalizedFinding[] {
  let filtered = findings;
  if (minSeverity !== undefined) {
    filtered = filtered.filter((f) => f.severity >= minSeverity);
  }
  if (cweIds && cweIds.length > 0) {
    const cweSet = new Set(cweIds.map((c) => c.toUpperCase()));
    filtered = filtered.filter((f) => cweSet.has(f.cwe_id.toUpperCase()));
  }
  return filtered;
}

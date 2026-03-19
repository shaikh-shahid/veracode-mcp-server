export interface RawFinding {
  title: string;
  issue_id: number;
  severity: number;
  issue_type: string;
  issue_type_id?: string;
  cwe_id: string;
  display_text: string;
  files: {
    source_file: {
      file: string;
      line: number;
      function_name: string;
      qualified_function_name?: string;
      function_prototype?: string;
    };
  };
  flaw_details_link?: string;
}

export interface RawScanResult {
  findings: RawFinding[];
  scan_id?: string;
  scan_status?: string;
  message?: string;
  pipeline_scan?: boolean;
}

export interface NormalizedFinding {
  issue_id: number;
  severity: number;
  severity_label: string;
  cwe_id: string;
  title: string;
  issue_type: string;
  file: string;
  line: number;
  function_name: string;
  description: string;
  flaw_details_link?: string;
}

export interface ScanSummary {
  scan_run_id: string;
  results_path: string;
  status: "completed" | "failed" | "timeout";
  total_findings: number;
  findings_by_severity: Record<string, number>;
  findings: NormalizedFinding[];
}

export interface FixResult {
  status: "success" | "no_fixes" | "unsupported" | "error";
  source_path: string;
  suggestions: string;
  raw_output: string;
  message: string;
}

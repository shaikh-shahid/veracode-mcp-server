import { access, stat } from "node:fs/promises";
import type { Config } from "../config.js";
import { runFix } from "../veracode/cli.js";

const ANSI_RE = /\x1b\[[0-9;]*m/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export async function executeSuggestFix(
  config: Config,
  args: {
    source_path: string;
    results_file?: string;
    issue_id?: number;
    apply?: boolean;
  }
) {
  try {
    await access(args.source_path);
  } catch {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "error",
            message: `Source path not found: ${args.source_path}`,
          }),
        },
      ],
    };
  }

  const pathStat = await stat(args.source_path);
  const isDir = pathStat.isDirectory();
  const fixType = isDir ? ("directory" as const) : ("file" as const);
  const applyMode = args.apply ?? false;

  console.error(
    `[suggest_fix] veracode fix --type ${fixType} on: ${args.source_path}` +
      (args.issue_id ? ` (issue ${args.issue_id})` : "") +
      (applyMode ? " (apply)" : " (suggest only)")
  );

  const cliResult = await runFix(config, args.source_path, {
    type: fixType,
    resultsFile: args.results_file,
    issueId: args.issue_id,
    apply: applyMode,
  });

  const cleanOutput = stripAnsi(cliResult.stdout);
  const hasFixContent =
    cleanOutput.includes("FIX") ||
    cleanOutput.includes("Issues found") ||
    cleanOutput.includes("---") ||
    cleanOutput.includes("+++");

  if (cliResult.exitCode === -1) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "timeout",
            source_path: args.source_path,
            message: "Fix command timed out (120s limit).",
            partial_output: cleanOutput.slice(0, 3000),
          }),
        },
      ],
    };
  }

  const combined = `${cleanOutput} ${cliResult.stderr}`.toLowerCase();
  if (
    combined.includes("not supported") ||
    combined.includes("not available") ||
    combined.includes("unsupported region")
  ) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "unsupported",
            source_path: args.source_path,
            message:
              "Veracode Fix is not available for this account or region. " +
              "Fix is currently limited to Commercial Region accounts.",
            raw_output: cleanOutput.slice(0, 3000),
          }),
        },
      ],
    };
  }

  // The CLI may exit non-zero when stdin closes at a prompt, but still
  // have printed useful fix output (issue list or patch diffs).
  if (cliResult.exitCode !== 0 && !hasFixContent) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "error",
            source_path: args.source_path,
            exit_code: cliResult.exitCode,
            message:
              "Fix command failed. Ensure a scan has been run first and " +
              "results_file points to the scan results JSON.",
            raw_output: cleanOutput.slice(0, 3000),
            stderr: cliResult.stderr.slice(0, 1000),
          }),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            status: "success",
            source_path: args.source_path,
            type: fixType,
            applied: applyMode,
            suggestions: cleanOutput,
            message: applyMode
              ? "Fixes applied. Run scan_file again to verify the flaws are resolved."
              : isDir
                ? "Batch fix completed for the directory."
                : args.issue_id
                  ? "Fix suggestions for the specified issue are shown above. Re-run with apply=true to auto-apply the top fix."
                  : "Issue list shown above. Re-run with a specific issue_id to see fix suggestions for that issue.",
          },
          null,
          2
        ),
      },
    ],
  };
}

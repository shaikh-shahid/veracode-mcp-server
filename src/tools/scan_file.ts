import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { access, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Config } from "../config.js";
import { runStaticScan } from "../veracode/cli.js";
import { parseResultsFile } from "../veracode/parsers.js";
import { getRandomFunFact } from "../veracode/fun-facts.js";

const execFileAsync = promisify(execFile);

type NotificationSender = (notification: unknown) => Promise<void>;

async function zipDirectory(dirPath: string): Promise<string> {
  const zipPath = join(tmpdir(), `veracode-artifact-${randomUUID()}.zip`);
  await execFileAsync("zip", ["-r", "-q", zipPath, ".", "-x", ".git/*", "node_modules/*", ".DS_Store"], {
    cwd: dirPath,
    timeout: 60_000,
  });
  console.error(`[scan_file] Zipped directory to: ${zipPath}`);
  return zipPath;
}

function startFunFactsTimer(sendNotification?: NotificationSender): NodeJS.Timeout | undefined {
  if (!sendNotification) return undefined;

  const emit = () => {
    const fact = getRandomFunFact();
    console.error(`[fun-fact] ${fact}`);
    sendNotification({
      method: "notifications/message",
      params: { level: "info", data: `Did you know? ${fact}` },
    }).catch(() => {});
  };

  emit();
  return setInterval(emit, 15_000);
}

export async function executeScanFile(
  config: Config,
  args: { path: string; min_severity?: string },
  sendNotification?: NotificationSender
) {
  try {
    await access(args.path);
  } catch {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "error",
            message: `Target path not found: ${args.path}`,
          }),
        },
      ],
    };
  }

  const scanRunId = randomUUID();
  const resultsFile = join(tmpdir(), `veracode-scan-${scanRunId}.json`);

  let scanTarget = args.path;
  const pathStat = await stat(args.path);
  if (pathStat.isDirectory()) {
    console.error(`[scan_file] Target is a directory — zipping for upload`);
    try {
      scanTarget = await zipDirectory(args.path);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "error",
              message: `Failed to zip directory: ${msg}`,
            }),
          },
        ],
      };
    }
  }

  console.error(`[scan_file] Scanning: ${scanTarget}`);
  console.error(`[scan_file] Results will be at: ${resultsFile}`);

  const factsTimer = startFunFactsTimer(sendNotification);

  let cliResult;
  try {
    cliResult = await runStaticScan(
      config,
      scanTarget,
      resultsFile,
      args.min_severity
    );
  } finally {
    if (factsTimer) clearInterval(factsTimer);
  }

  if (cliResult.exitCode === -1) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "timeout",
            scan_run_id: scanRunId,
            results_path: resultsFile,
            message:
              "Scan timed out. Increase SCAN_TIMEOUT_MS or scan a smaller target.",
            stderr: cliResult.stderr.slice(0, 500),
          }),
        },
      ],
    };
  }

  const summary = await parseResultsFile(resultsFile, scanRunId);
  if (
    cliResult.exitCode !== 0 &&
    cliResult.exitCode !== 3 &&
    summary.status !== "completed"
  ) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "failed",
            scan_run_id: scanRunId,
            results_path: resultsFile,
            exit_code: cliResult.exitCode,
            message:
              "Scan command failed and no parseable results were produced.",
            stdout: cliResult.stdout.slice(0, 1000),
            stderr: cliResult.stderr.slice(0, 1000),
          }),
        },
      ],
    };
  }

  if (cliResult.exitCode !== 0 && cliResult.exitCode !== 3) {
    console.error(
      `[scan_file] Non-zero exit (${cliResult.exitCode}) but results parsed successfully`
    );
  }

  console.error(
    `[scan_file] Complete: ${summary.total_findings} finding(s) found`
  );

  const funFact = getRandomFunFact();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { ...summary, fun_fact: `Did you know? ${funFact}` },
          null,
          2
        ),
      },
    ],
  };
}

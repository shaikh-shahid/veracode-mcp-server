import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir, homedir } from "node:os";
import type { Config } from "../config.js";

const execFileAsync = promisify(execFile);

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Build a subprocess env that ensures HMAC credentials from env vars
 * take effect even if ~/.veracode/veracode.yml exists and is broken.
 *
 * When VERACODE_API_KEY_ID + VERACODE_API_KEY_SECRET are set, we point
 * the CLI at a clean config directory (with only a credentials file)
 * so a stale/broken veracode.yml can't block HMAC auth.
 */
function buildCliEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  const apiId = env.VERACODE_API_KEY_ID;
  const apiKey = env.VERACODE_API_KEY_SECRET;

  if (!apiId || !apiKey) return env;

  const ymlPath = join(homedir(), ".veracode", "veracode.yml");
  if (!existsSync(ymlPath)) return env;

  const cleanDir = mkdtempSync(join(tmpdir(), "veracode-mcp-"));
  const credContent = `[default]\nveracode_api_key_id = ${apiId}\nveracode_api_key_secret = ${apiKey}\n`;
  writeFileSync(join(cleanDir, "credentials"), credContent, { mode: 0o600 });

  env.VERACODE_HOME = cleanDir;
  console.error(`[cli] Using clean config dir to bypass veracode.yml: ${cleanDir}`);
  return env;
}

export async function runVeracodeCommand(
  config: Config,
  args: string[],
  timeoutMs?: number
): Promise<CliResult> {
  console.error(`[cli] veracode ${args.join(" ")}`);
  const env = buildCliEnv();
  try {
    const { stdout, stderr } = await execFileAsync(config.cliPath, args, {
      timeout: timeoutMs ?? config.scanTimeoutMs,
      maxBuffer: 50 * 1024 * 1024,
      env,
    });
    return { exitCode: 0, stdout, stderr };
  } catch (err: unknown) {
    const e = err as {
      code?: string;
      status?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    return {
      exitCode: e.code === "ETIMEDOUT" ? -1 : (e.status ?? 1),
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? e.message ?? "Unknown error",
    };
  }
}

export async function runStaticScan(
  config: Config,
  targetPath: string,
  resultsFile: string,
  minSeverity?: string
): Promise<CliResult> {
  const args = ["static", "scan", targetPath, "--results-file", resultsFile];
  if (minSeverity) {
    args.push("--fail-on-severity", minSeverity);
  }
  return runVeracodeCommand(config, args);
}

export interface FixOptions {
  type?: "file" | "directory";
  resultsFile?: string;
  issueId?: number;
  apply?: boolean;
}

/**
 * Run `veracode fix` with stdin immediately closed.
 *
 * The fix CLI is interactive (prompts for issue/fix selection).
 * By closing stdin the process receives EOF at prompts and exits
 * after printing whatever output it has (issue list or fix diffs).
 *
 * For fully non-interactive usage:
 *  - Pass issueId to skip the "select issue" prompt
 *  - Pass apply=true to auto-apply the top fix (no "select fix" prompt)
 *  - For directory type, fixes are batch-applied automatically
 */
export function runFix(
  config: Config,
  sourcePath: string,
  opts: FixOptions = {}
): Promise<CliResult> {
  const args = ["fix", sourcePath];
  args.push("--type", opts.type ?? "file");
  if (opts.resultsFile) {
    args.push("--results", opts.resultsFile);
  }
  if (opts.issueId !== undefined) {
    args.push("--issue-id", String(opts.issueId));
  }
  if (opts.apply) {
    args.push("--apply");
  }
  args.push("--verbose");

  console.error(`[cli] veracode ${args.join(" ")}`);
  const env = buildCliEnv();

  return new Promise((resolve) => {
    const child = spawn(config.cliPath, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      resolve({ exitCode: -1, stdout, stderr });
    }, 120_000);

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr: stderr || err.message });
    });
  });
}

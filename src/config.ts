import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const execFileAsync = promisify(execFile);

export interface Config {
  cliPath: string;
  scanTimeoutMs: number;
}

export function loadConfig(): Config {
  return {
    cliPath: process.env.VERACODE_CLI_PATH || "veracode",
    scanTimeoutMs: parseInt(process.env.SCAN_TIMEOUT_MS || "300000", 10),
  };
}

export async function preflight(config: Config): Promise<void> {
  try {
    const { stdout } = await execFileAsync(config.cliPath, ["version"], {
      timeout: 10_000,
    });
    console.error(`[preflight] Veracode CLI: ${stdout.trim()}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Veracode CLI not found at "${config.cliPath}". ` +
        `Install: https://docs.veracode.com/r/Install_the_Veracode_CLI\n` +
        `Or set VERACODE_CLI_PATH. Error: ${msg}`
    );
  }

  if (
    !process.env.VERACODE_API_KEY_ID ||
    !process.env.VERACODE_API_KEY_SECRET
  ) {
    const hasCredFile = await checkCredentialsFile();
    if (!hasCredFile) {
      console.error(
        "[preflight] WARNING: No VERACODE_API_KEY_ID / VERACODE_API_KEY_SECRET set " +
          "and no ~/.veracode/credentials file found. Scans will fail."
      );
    }
  }
}

async function checkCredentialsFile(): Promise<boolean> {
  try {
    await access(join(homedir(), ".veracode", "credentials"));
    return true;
  } catch {
    return false;
  }
}

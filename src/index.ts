#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadConfig, preflight } from "./config.js";
import { executeScanFile } from "./tools/scan_file.js";
import { executeGetFindings } from "./tools/get_findings.js";
import { executeSuggestFix } from "./tools/suggest_fix.js";

const config = loadConfig();

const server = new McpServer(
  { name: "veracode-mcp-server", version: "0.1.0" },
  { capabilities: { logging: {} } }
);

server.registerTool(
  "scan_file",
  {
    title: "Scan File",
    description:
      "Run a Veracode Pipeline Scan (static analysis) on a file or directory. " +
      "If a directory is given it is automatically zipped before upload. " +
      "Returns security findings with severity, CWE ID, file location, and line number. " +
      "Also returns a results_path JSON file needed by suggest_fix. " +
      "Typical scan completes in ~90 seconds.",
    inputSchema: {
      path: z.string().describe("Absolute path to the file or directory to scan"),
      min_severity: z
        .string()
        .optional()
        .describe(
          'Minimum severity to report, e.g. "Very High, High". Default: all severities'
        ),
    },
  },
  async (args, extra) => executeScanFile(
    config,
    args,
    (n: unknown) => extra.sendNotification(n as Parameters<typeof extra.sendNotification>[0])
  )
);

server.registerTool(
  "get_findings",
  {
    title: "Get Findings",
    description:
      "Load and filter findings from a previous scan_file result. " +
      "Pass the results_path returned by scan_file. " +
      "Supports filtering by minimum severity level and specific CWE IDs.",
    inputSchema: {
      results_path: z
        .string()
        .describe("Path to the scan results JSON file (from scan_file output)"),
      min_severity: z
        .number()
        .optional()
        .describe("Minimum severity level: 1=Very Low, 2=Low, 3=Medium, 4=High, 5=Very High"),
      cwe_ids: z
        .array(z.string())
        .optional()
        .describe('Filter to specific CWE IDs, e.g. ["CWE-89", "CWE-78"]'),
    },
  },
  async (args) => executeGetFindings(args)
);

server.registerTool(
  "suggest_fix",
  {
    title: "Suggest Fix",
    description:
      "Generate Veracode Fix suggestions for security flaws in source code. " +
      "Uses AI-assisted remediation to produce secure code patches. " +
      "REQUIRES the results_file (results_path from scan_file output). " +
      "Auto-detects file vs directory target for single or batch fix mode. " +
      "Note: Only available for Commercial Region Veracode accounts.",
    inputSchema: {
      source_path: z
        .string()
        .describe("Absolute path to the source file or directory to fix"),
      results_file: z
        .string()
        .describe("Path to scan results JSON file (results_path from scan_file output)"),
      issue_id: z
        .number()
        .optional()
        .describe("Numeric issue ID from scan results to target a specific flaw"),
      apply: z
        .boolean()
        .optional()
        .describe(
          "If true, auto-apply the top suggested fix. Default: false (show suggestions only). " +
          "For directory targets, batch-applies all safe fixes."
        ),
    },
  },
  async (args) => executeSuggestFix(config, args)
);

async function main() {
  try {
    await preflight(config);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[startup] Preflight warning: ${msg}`);
    console.error("[startup] Server will start, but scans may fail without CLI/credentials.");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Veracode MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

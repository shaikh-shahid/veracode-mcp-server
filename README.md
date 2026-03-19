# Veracode MCP Server

An MCP (Model Context Protocol) server that wraps the **Veracode CLI** to bring security scanning and AI-assisted fix suggestions directly into Claude Code and Cursor.

```
User writes code in Cursor / Claude Code
         |
Claude invokes MCP tool:  scan_file("/path/to/project")
         |
MCP Server --> veracode static scan --> polls until done (~90s)
         |
Returns: "Found 2 HIGH flaws:
  - CWE-89 SQL Injection at auth.py:42
  - CWE-78 OS Command Injection at auth.py:67"
         |
Claude invokes MCP tool:  suggest_fix("/path/to/auth.py")
         |
MCP Server --> veracode fix --> returns patch suggestions
         |
Claude explains the flaw + shows the Veracode-recommended fix
```

## Prerequisites

1. **Veracode CLI** installed and in your PATH
   - Install: https://docs.veracode.com/r/Install_the_Veracode_CLI
   - Verify: `veracode version`

2. **Veracode API Credentials** — configure via one of:
   - Environment variables: `VERACODE_API_KEY_ID` and `VERACODE_API_KEY_SECRET`
   - Credentials file: `~/.veracode/credentials`

3. **Node.js** >= 18

> **Note:** Veracode Fix suggestions require a **Commercial Region** Veracode account. EU and US Federal regions are not currently supported for Fix.

## Quick Setup

```bash
cd veracode-mcp-server
npm install
npm run build
```

### Test it works

```bash
# Set credentials (or use ~/.veracode/credentials)
export VERACODE_API_KEY_ID="your-id"
export VERACODE_API_KEY_SECRET="your-key"

# Run the server (it will print preflight status to stderr)
node dist/index.js
```

You should see:

```
[preflight] Veracode CLI: Veracode CLI v2.x.x
Veracode MCP Server running on stdio
```

## Configure in Cursor

Add to your Cursor MCP settings file (`.cursor/mcp.json` in your project or global settings):

```json
{
  "mcpServers": {
    "veracode": {
      "command": "node",
      "args": ["/absolute/path/to/veracode-mcp-server/dist/index.js"],
      "env": {
        "VERACODE_API_KEY_ID": "your-id",
        "VERACODE_API_KEY_SECRET": "your-key"
      }
    }
  }
}
```

## Configure in Claude Code

```bash
claude mcp add veracode -- node /absolute/path/to/veracode-mcp-server/dist/index.js
```

Set credentials in your shell environment before launching Claude Code.

## Available Tools

### `scan_file`

Run a Veracode Pipeline Scan (static analysis) on a file or directory.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `path` | string | yes | Absolute path to file or directory to scan |
| `min_severity` | string | no | Minimum severity to report, e.g. `"Very High, High"` |

**Returns:** scan run ID, results file path, finding counts by severity, and full normalized findings list.

### `get_findings`

Load and filter findings from a previous `scan_file` result.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `results_path` | string | yes | Path to scan results JSON (from `scan_file` output) |
| `min_severity` | number | no | 1=Very Low, 2=Low, 3=Medium, 4=High, 5=Very High |
| `cwe_ids` | string[] | no | Filter to specific CWEs, e.g. `["CWE-89"]` |

### `suggest_fix`

Generate Veracode Fix suggestions for security flaws in source code.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source_path` | string | yes | Path to file or directory to generate fixes for |
| `results_file` | string | no | Path to scan results JSON (helps target flaws) |
| `apply` | boolean | no | Auto-apply fixes if `true`. Default: `false` (suggest only) |

**Returns:** Veracode Fix output with suggested patches.

## Demo Walkthrough

1. **Scan your code:**
   > "Scan `/path/to/my/project` for security vulnerabilities"

2. **Review findings:**
   > "Show me only the HIGH and VERY HIGH severity findings from the last scan"

3. **Get fix suggestions:**
   > "Suggest a fix for the SQL injection found in auth.py"

4. **Apply and re-verify:**
   > "Apply the fix and re-scan to confirm it's resolved"

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VERACODE_API_KEY_ID` | Yes* | — | Veracode API ID |
| `VERACODE_API_KEY_SECRET` | Yes* | — | Veracode API Key |
| `VERACODE_CLI_PATH` | No | `veracode` | Path to CLI binary |
| `SCAN_TIMEOUT_MS` | No | `300000` | Scan timeout (5 min default) |

\* Can also be configured via `~/.veracode/credentials`.

## Project Structure

```
src/
├── index.ts              # Server bootstrap + tool registration
├── config.ts             # Env config + CLI preflight checks
├── veracode/
│   ├── cli.ts            # Safe subprocess wrapper for veracode commands
│   ├── parsers.ts        # Normalize CLI JSON output into stable types
│   └── types.ts          # TypeScript interfaces for findings/fixes
└── tools/
    ├── scan_file.ts      # scan_file tool implementation
    ├── get_findings.ts   # get_findings tool implementation
    └── suggest_fix.ts    # suggest_fix tool implementation
```

## Troubleshooting

**"Veracode CLI not found"** — Install the CLI and ensure `veracode` is in your PATH, or set `VERACODE_CLI_PATH`.

**"Scan failed / credentials error"** — Check `VERACODE_API_KEY_ID` and `VERACODE_API_KEY_SECRET` are set, or verify `~/.veracode/credentials`.

**"Fix not available / unsupported"** — Veracode Fix is only available for Commercial Region accounts. EU/Federal accounts will get a structured error message.

**"Scan timed out"** — Increase `SCAN_TIMEOUT_MS` or scan a smaller target. Pipeline Scan median is ~90s but can be longer for large codebases.

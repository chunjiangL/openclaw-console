#!/usr/bin/env node

/**
 * claw-console CLI
 *
 * Usage:
 *   claw-console [mode] [options]
 *
 * Modes:
 *   local   Listen on 127.0.0.1 only (default)
 *   lan     Listen on 0.0.0.0, allow only localhost + Tailscale IPs
 *   all     Listen on 0.0.0.0, allow all connections (no IP filtering)
 *
 * Options:
 *   --port, -p <port>   Port to listen on (default: 3000)
 *   --dev               Run in dev mode with Turbopack (hot reload)
 *   --build             Build only (do not start server)
 *   --help, -h          Show this help
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const MODES = ["local", "lan", "all"];

let mode = "local";
let port = "3000";
let dev = false;
let buildOnly = false;
let help = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (MODES.includes(arg)) {
    mode = arg;
  } else if (arg === "--port" || arg === "-p") {
    port = args[++i] || "3000";
  } else if (arg === "--dev") {
    dev = true;
  } else if (arg === "--build") {
    buildOnly = true;
  } else if (arg === "--help" || arg === "-h") {
    help = true;
  }
}

if (help) {
  console.log(`
  claw-console — OpenClaw Dashboard

  USAGE
    claw-console [mode] [options]

  MODES
    local   127.0.0.1 only (default, most secure)
    lan     0.0.0.0 + Tailscale IP filter (devices on your tailnet)
    all     0.0.0.0 + no filter (anyone can access)

  OPTIONS
    --port, -p <port>   Port (default: 3000)
    --dev               Dev mode with hot reload
    --build             Build only, don't start
    -h, --help          Show this help

  EXAMPLES
    claw-console                    # localhost:3000
    claw-console lan                # tailscale-only on :3000
    claw-console lan -p 8080        # tailscale-only on :8080
    claw-console all --dev          # open dev server
    claw-console --build            # build for production
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Write runtime access mode for middleware
// ---------------------------------------------------------------------------
const accessConfigPath = resolve(ROOT, ".access-mode");
writeFileSync(accessConfigPath, mode, "utf-8");

// ---------------------------------------------------------------------------
// Resolve hostname
// ---------------------------------------------------------------------------
const hostname = mode === "local" ? "127.0.0.1" : "0.0.0.0";

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
function banner() {
  const modeLabel = {
    local: "LOCALHOST ONLY",
    lan: "TAILSCALE NETWORK",
    all: "ALL CONNECTIONS",
  }[mode];

  console.log("");
  console.log("  ╔══════════════════════════════════════╗");
  console.log("  ║         CLAW CONSOLE                 ║");
  console.log("  ╠══════════════════════════════════════╣");
  console.log(`  ║  MODE:  ${(modeLabel || "").padEnd(28)}║`);
  console.log(`  ║  HOST:  ${hostname.padEnd(28)}║`);
  console.log(`  ║  PORT:  ${port.padEnd(28)}║`);
  console.log("  ╚══════════════════════════════════════╝");
  console.log("");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
function run(cmd, args, env = {}) {
  const child = spawn(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, ...env, CLAW_ACCESS_MODE: mode },
  });
  child.on("exit", (code) => process.exit(code ?? 0));
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
}

if (buildOnly) {
  console.log("  Building claw-console...");
  run("npx", ["next", "build"]);
} else if (dev) {
  banner();
  run("npx", ["next", "dev", "--turbopack", "--hostname", hostname, "--port", port]);
} else {
  // Production: check if built
  const standalonePath = resolve(ROOT, ".next", "standalone", "server.js");
  const nextDir = resolve(ROOT, ".next");

  if (!existsSync(nextDir)) {
    console.log("  No build found. Building...");
    const build = spawn("npx", ["next", "build"], { cwd: ROOT, stdio: "inherit" });
    build.on("exit", (code) => {
      if (code !== 0) {
        console.error("  Build failed.");
        process.exit(1);
      }
      banner();
      startProduction();
    });
  } else {
    banner();
    startProduction();
  }
}

function startProduction() {
  run("npx", ["next", "start", "--hostname", hostname, "--port", port]);
}

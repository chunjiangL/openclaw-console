import { exec } from "node:child_process";

/**
 * Server-side API route that discovers the gateway URL.
 *
 * - On localhost: returns http://localhost:18789
 * - On Tailscale: runs `tailscale status --json` to discover the .ts.net hostname
 * - Otherwise: returns null (client must enter manually)
 */
export async function GET() {
  // Try tailscale CLI to get the MagicDNS hostname
  const hostname = await getTailscaleHostname();
  if (hostname) {
    return Response.json({ url: `https://${hostname}` });
  }

  // Fallback: localhost
  return Response.json({ url: "http://localhost:18789" });
}

function getTailscaleHostname(): Promise<string | null> {
  return new Promise((resolve) => {
    // Try macOS app path first, then PATH
    const cmds = [
      "/Applications/Tailscale.app/Contents/MacOS/Tailscale status --json",
      "tailscale status --json",
    ];

    tryCommand(cmds, 0, resolve);
  });
}

function tryCommand(
  cmds: string[],
  idx: number,
  resolve: (v: string | null) => void,
) {
  if (idx >= cmds.length) {
    resolve(null);
    return;
  }

  exec(cmds[idx], { timeout: 5000 }, (err, stdout) => {
    if (err) {
      tryCommand(cmds, idx + 1, resolve);
      return;
    }
    try {
      const data = JSON.parse(stdout);
      const dns: string = data?.Self?.DNSName ?? "";
      // Remove trailing dot from FQDN
      const hostname = dns.replace(/\.$/, "");
      resolve(hostname || null);
    } catch {
      tryCommand(cmds, idx + 1, resolve);
    }
  });
}

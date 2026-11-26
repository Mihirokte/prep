import { execFile } from 'node:child_process'

export interface TailnetIdentity {
  /** The Tailscale login that owns this Mac, e.g. someone@github. */
  login: string
  /** This Mac's tailnet name without the trailing dot. */
  dnsName: string
}

const CANDIDATES = ['/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale', 'tailscale']

function run(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, ['status', '--json'], { timeout: 5000, maxBuffer: 8_000_000 }, (err, stdout) => resolve(err ? null : String(stdout)))
  })
}

/** Who this Mac is on the tailnet, or null when Tailscale is missing or signed out.
 *  Only this login may use the web server: Tailscale Serve stamps each request
 *  with the caller's login, and nothing else can reach the loopback port. */
export async function tailnetIdentity(): Promise<TailnetIdentity | null> {
  for (const bin of CANDIDATES) {
    const out = await run(bin)
    if (!out) continue
    try {
      const status = JSON.parse(out) as {
        Self?: { UserID?: number; DNSName?: string }
        User?: Record<string, { LoginName?: string }>
      }
      const login = status.User?.[String(status.Self?.UserID)]?.LoginName
      const dnsName = status.Self?.DNSName?.replace(/\.$/, '')
      if (login && dnsName) return { login, dnsName }
    } catch {
      // not JSON: try the next candidate
    }
  }
  return null
}

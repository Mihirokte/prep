import { type ChildProcess, execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

// Adapter for the local Antigravity CLI (`agy`) in headless print mode.
// Always execFile with an argv array — the prompt is never interpolated into a
// shell command.

const HOME_BIN = path.join(os.homedir(), '.local', 'bin')

/** Apps launched from Finder get a minimal PATH, so look in the usual places. */
const CANDIDATES = [path.join(HOME_BIN, 'agy'), '/opt/homebrew/bin/agy', '/usr/local/bin/agy']

async function executable(p: string): Promise<boolean> {
  try {
    await access(p, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function execText(bin: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve) => {
    execFile(bin, args, { timeout }, (err, stdout) => resolve(err ? '' : String(stdout)))
  })
}

export async function findAgy(override?: string): Promise<string | null> {
  for (const p of [override, process.env.PREP_AGY, ...CANDIDATES])
    if (p && (await executable(p))) return p
  // Last resort: ask the login shell, which has the user's full PATH.
  const fromShell = (await execText('/bin/zsh', ['-lc', 'command -v agy'], 8000)).trim()
  return fromShell && (await executable(fromShell)) ? fromShell : null
}

export interface AgyOptions {
  schemaFile: string
  cwd: string
  timeoutSec: number
  model?: string
  effort?: 'low' | 'medium' | 'high'
}

export interface AgyOutput {
  status: string
  structured: unknown
  response: string
  denied: string[]
  durationSec: number | null
}

const childEnv = (): NodeJS.ProcessEnv => ({
  ...process.env,
  PATH: [process.env.PATH, HOME_BIN, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin']
    .filter(Boolean)
    .join(':'),
})

/** agy may print notices before its JSON; take the last line that parses. */
function parseOutput(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line.startsWith('{')) continue
    try {
      const v: unknown = JSON.parse(line)
      if (v && typeof v === 'object' && 'status' in v) return v as Record<string, unknown>
    } catch {
      // not the result line; keep scanning upward
    }
  }
  return null
}

export function runAgy(
  bin: string,
  prompt: string,
  opts: AgyOptions,
  onSpawn: (child: ChildProcess) => void,
): Promise<AgyOutput> {
  const args = [
    `--print=${prompt}`,
    '--output-format',
    'json',
    '--json-schema',
    opts.schemaFile,
    '--print-timeout',
    `${opts.timeoutSec}s`,
    '--disable-slash-commands',
  ]
  if (opts.model) args.push('--model', opts.model)
  if (opts.effort) args.push('--effort', opts.effort)

  return new Promise((resolve, reject) => {
    const child = execFile(
      bin,
      args,
      {
        cwd: opts.cwd,
        env: childEnv(),
        maxBuffer: 32 * 1024 * 1024,
        timeout: (opts.timeoutSec + 30) * 1000,
      },
      (err, stdout, stderr) => {
        const out = parseOutput(String(stdout))
        if (!out) {
          const tail = `${String(stderr)}\n${String(stdout)}`.trim().split('\n').slice(-6).join('\n')
          return reject(new Error(err ? `agy failed: ${err.message}\n${tail}` : `agy returned no result.\n${tail}`))
        }
        const denied = Array.isArray(out.denied_actions)
          ? out.denied_actions.map((a) => String((a as { action?: unknown }).action ?? '?'))
          : []
        resolve({
          status: String(out.status ?? ''),
          structured: out.structured_output ?? null,
          response: typeof out.response === 'string' ? out.response : '',
          denied,
          durationSec: typeof out.duration_seconds === 'number' ? out.duration_seconds : null,
        })
      },
    )
    onSpawn(child)
  })
}

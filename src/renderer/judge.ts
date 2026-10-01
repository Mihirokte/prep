export type JudgeState = 'booting' | 'ready' | 'failed'

export type ValidateOutcome =
  | { status: 'ok'; message: string; stdout: string }
  | { status: 'invalid'; message: string }
  | { status: 'timeout' }
  | { status: 'error'; message: string }

const BOOT_BUDGET_MS = 120_000

/** Lightweight Python validator: compiles the code (catches syntax/indent
 * errors) and, when an expected symbol is given, checks it's defined and
 * callable. NO correctness judging — paste into LeetCode for that. */
export class Validator {
  private worker: Worker | null = null
  private pending = new Map<string, (o: ValidateOutcome) => void>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private seq = 0
  private ready: Promise<void> = Promise.resolve()
  private readyOk: (() => void) | null = null
  private readyFail: ((e: Error) => void) | null = null
  state: JudgeState = 'booting'
  onState: (s: JudgeState) => void = () => {}

  start(): void {
    if (this.worker) return
    this.spawn()
  }

  private setState(s: JudgeState) {
    this.state = s
    this.onState(s)
  }

  private spawn(): void {
    this.setState('booting')
    this.ready = new Promise<void>((ok, fail) => {
      this.readyOk = ok
      this.readyFail = fail
    })
    this.ready.catch(() => {})
    this.worker = new Worker(`${import.meta.env.BASE_URL}validate-worker.mjs`, { type: 'module' })
    this.worker.onmessage = (e: MessageEvent) => {
      const msg = e.data
      if (msg.type === 'ready') return this.setState('ready'), this.readyOk?.()
      if (msg.type === 'boot_error')
        return this.setState('failed'), this.readyFail?.(new Error(msg.message))
      const resolve = this.pending.get(msg.id)
      if (!resolve) return
      this.pending.delete(msg.id)
      const timer = this.timers.get(msg.id)
      if (timer) clearTimeout(timer)
      this.timers.delete(msg.id)
      resolve(msg.outcome as ValidateOutcome)
    }
  }

  async validate(code: string, expectSymbol?: string, timeoutMs = 10000): Promise<ValidateOutcome> {
    this.start()
    try {
      await Promise.race([
        this.ready,
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error('boot budget exceeded')), BOOT_BUDGET_MS),
        ),
      ])
    } catch (e) {
      return {
        status: 'error',
        message:
          'Python runtime could not load (' +
          (e instanceof Error ? e.message : String(e)) +
          '). Reload the window (⌘R).',
      }
    }
    const id = String(++this.seq)
    return new Promise<ValidateOutcome>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.timers.delete(id)
        this.worker?.terminate()
        this.worker = null
        this.spawn()
        resolve({ status: 'timeout' })
      }, timeoutMs)
      this.pending.set(id, resolve)
      this.timers.set(id, timer)
      this.worker!.postMessage({ type: 'validate', id, code, expectSymbol })
    })
  }
}

export const validator = new Validator()

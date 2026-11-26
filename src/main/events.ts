import { EventEmitter } from 'node:events'

/** What the main process announces to every connected page (the Mac window and
 *  phones). Payloads stay tiny: a page that hears "content" fetches the content
 *  itself, so a change never pushes 8 MB to each device. */
export interface AppEvents {
  content: []
  progress: [key: string]
}

class Bus {
  private readonly emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(64)
  }

  on<K extends keyof AppEvents>(name: K, cb: (...args: AppEvents[K]) => void): () => void {
    this.emitter.on(name, cb as (...a: unknown[]) => void)
    return () => {
      this.emitter.off(name, cb as (...a: unknown[]) => void)
    }
  }

  emit<K extends keyof AppEvents>(name: K, ...args: AppEvents[K]): void {
    this.emitter.emit(name, ...args)
  }
}

export const bus = new Bus()

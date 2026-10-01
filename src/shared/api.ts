import type { Change } from './ops'
import type { Content } from './types'

// The bridge the preload script exposes as `window.prep`. Types only — the
// renderer never sees ipcRenderer, Node, or the file system directly.

export interface TranscriptEntry {
  role: 'user' | 'assistant' | 'applied'
  text: string
}

export type AgentResult =
  | { kind: 'answer'; reply: string }
  | { kind: 'proposal'; id: string; reply: string; changes: Change[] }
  | { kind: 'error'; message: string }

export type ApplyResult = { ok: true; summary: string } | { ok: false; error: string }

export interface AgentStatus {
  /** Path of the agy CLI, or null when it cannot be found. */
  agyPath: string | null
  /** How many applied change sets can be undone. */
  undoable: number
  busy: boolean
}

export type MenuEvent = 'palette' | 'assistant' | 'home' | 'sidebar'

export interface PrepApi {
  content: {
    get(): Promise<Content>
    /** Fires with the new store after every applied change or undo. */
    onChanged(cb: (content: Content) => void): () => void
  }
  progress: {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    remove(key: string): Promise<void>
  }
  agent: {
    run(request: { message: string; transcript: TranscriptEntry[] }): Promise<AgentResult>
    cancel(): Promise<void>
    apply(proposalId: string): Promise<ApplyResult>
    discard(proposalId: string): Promise<void>
    undo(): Promise<ApplyResult>
    status(): Promise<AgentStatus>
  }
  onMenu(cb: (event: MenuEvent) => void): () => void
}

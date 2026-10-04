import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

// Unified progress store. Lessons are read/unread (+ optional bookmark);
// problems keep the richer attempted/solved/revisit + code + notes model.

export type LessonStatus = 'unread' | 'read'
export type ProblemStatus = 'none' | 'attempted' | 'solved' | 'revisit'

export interface LessonProgress {
  status: LessonStatus
  notes?: string
  updatedAt: string
}

export interface ProblemProgress {
  status: ProblemStatus
  notes?: string
  code?: string
  /** ISO time the problem was first marked solved. */
  solvedAt?: string
  /** Seconds spent on the problem page timer. */
  seconds?: number
  updatedAt: string
}

/** One self-check card in the Leitner box system. */
export interface RecallCard {
  box: number
  /** ISO time the card is next due. */
  due: string
  seen: number
}

export interface ProgressState {
  lessons: Record<string, LessonProgress>
  problems: Record<string, ProblemProgress>
  recall: Record<string, RecallCard>
}

/** Days until a card returns, by box. Box 0 is "again": due immediately. */
export const RECALL_DAYS = [0, 1, 3, 7, 16, 35]

const initialState: ProgressState = { lessons: {}, problems: {}, recall: {} }

const now = () => new Date().toISOString()

export const progressSlice = createSlice({
  name: 'progress',
  initialState,
  reducers: {
    setLessonStatus(state, action: PayloadAction<{ id: string; status: LessonStatus }>) {
      const cur = state.lessons[action.payload.id] ?? { status: 'unread', updatedAt: '' }
      state.lessons[action.payload.id] = { ...cur, status: action.payload.status, updatedAt: now() }
    },
    setLessonNotes(state, action: PayloadAction<{ id: string; notes: string }>) {
      const cur = state.lessons[action.payload.id] ?? { status: 'unread', updatedAt: '' }
      state.lessons[action.payload.id] = { ...cur, notes: action.payload.notes, updatedAt: now() }
    },
    setProblemStatus(state, action: PayloadAction<{ id: string; status: ProblemStatus }>) {
      const cur = state.problems[action.payload.id] ?? { status: 'none', updatedAt: '' }
      const solvedAt = action.payload.status === 'solved' ? (cur.solvedAt ?? now()) : cur.solvedAt
      state.problems[action.payload.id] = { ...cur, status: action.payload.status, solvedAt, updatedAt: now() }
    },
    addProblemTime(state, action: PayloadAction<{ id: string; seconds: number }>) {
      const cur = state.problems[action.payload.id] ?? { status: 'none', updatedAt: '' }
      state.problems[action.payload.id] = { ...cur, seconds: (cur.seconds ?? 0) + action.payload.seconds, updatedAt: now() }
    },
    rateRecall(state, action: PayloadAction<{ id: string; good: boolean }>) {
      state.recall ??= {}
      const cur = state.recall[action.payload.id] ?? { box: 0, due: '', seen: 0 }
      const box = action.payload.good ? Math.min(cur.box + 1, RECALL_DAYS.length - 1) : 0
      const due = new Date(Date.now() + RECALL_DAYS[box] * 86400000).toISOString()
      state.recall[action.payload.id] = { box, due, seen: cur.seen + 1 }
    },
    setProblemNotes(state, action: PayloadAction<{ id: string; notes: string }>) {
      const cur = state.problems[action.payload.id] ?? { status: 'none', updatedAt: '' }
      state.problems[action.payload.id] = { ...cur, notes: action.payload.notes, updatedAt: now() }
    },
    setProblemCode(state, action: PayloadAction<{ id: string; code: string }>) {
      const cur = state.problems[action.payload.id] ?? { status: 'none', updatedAt: '' }
      state.problems[action.payload.id] = { ...cur, code: action.payload.code, updatedAt: now() }
    },
    importAll(_state, action: PayloadAction<ProgressState>) {
      return {
        lessons: { ...action.payload.lessons },
        problems: { ...action.payload.problems },
        recall: { ...(action.payload.recall ?? {}) },
      }
    },
    resetAll() {
      return initialState
    },
  },
})

export const {
  setLessonStatus,
  setLessonNotes,
  setProblemStatus,
  addProblemTime,
  rateRecall,
  setProblemNotes,
  setProblemCode,
  importAll,
  resetAll,
} = progressSlice.actions

export default progressSlice.reducer

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
  updatedAt: string
}

export interface ProgressState {
  lessons: Record<string, LessonProgress>
  problems: Record<string, ProblemProgress>
}

const initialState: ProgressState = { lessons: {}, problems: {} }

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
      state.problems[action.payload.id] = { ...cur, status: action.payload.status, updatedAt: now() }
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
  setProblemNotes,
  setProblemCode,
  importAll,
  resetAll,
} = progressSlice.actions

export default progressSlice.reducer

import { configureStore } from '@reduxjs/toolkit'
import { persistStore, persistReducer } from 'redux-persist'
import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux'
import progressReducer from './progressSlice'

// Progress persists through the main process to progress.json in Application
// Support, under the same key and format the web portal used in localStorage,
// so Export / Import files move freely between the two.
const fileStorage = {
  getItem: (key: string) => window.prep.progress.get(key),
  setItem: (key: string, value: string) => window.prep.progress.set(key, value),
  removeItem: (key: string) => window.prep.progress.remove(key),
}

const persistConfig = { key: 'prep-v2', version: 1, storage: fileStorage }
const persistedReducer = persistReducer(persistConfig, progressReducer)

export const store = configureStore({
  reducer: { progress: persistedReducer },
  middleware: (getDefault) =>
    getDefault({
      // redux-persist dispatches non-serializable actions internally
      serializableCheck: { ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'] },
    }),
})

export const persistor = persistStore(store)

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
export const useAppDispatch = () => useDispatch<AppDispatch>()
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector

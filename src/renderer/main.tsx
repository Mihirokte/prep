import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import App from './App'
import { DataProvider } from './model/DataProvider'
import { store, persistor } from './store'
import './prep.css'
import { initTheme } from './useTheme'

initTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <DataProvider>
          <App />
        </DataProvider>
      </PersistGate>
    </Provider>
  </StrictMode>,
)

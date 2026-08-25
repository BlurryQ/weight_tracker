import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.tsx'

// Match the native status bar to the app's near-black theme — otherwise Android defaults to a
// light bar that clashes with the dark design on launch.
if (Capacitor.isNativePlatform()) {
  void Promise.all([import('@capacitor/status-bar')]).then(([{ StatusBar, Style }]) => {
    void StatusBar.setStyle({ style: Style.Dark })
    void StatusBar.setBackgroundColor({ color: '#0b0c0b' })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

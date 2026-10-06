import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// A picture that can't load (offline, say) is hidden rather than drawn as a broken image, everywhere;
// it comes back if it loads later. Load and error events don't bubble, so they're caught on the way down.
window.addEventListener(
  'error',
  (e) => {
    if (!(e.target instanceof HTMLImageElement)) return
    e.target.dataset.broken = ''
    e.target.style.visibility = 'hidden'
  },
  true
)
window.addEventListener(
  'load',
  (e) => {
    if (!(e.target instanceof HTMLImageElement) || !('broken' in e.target.dataset)) return
    delete e.target.dataset.broken
    e.target.style.visibility = ''
  },
  true
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

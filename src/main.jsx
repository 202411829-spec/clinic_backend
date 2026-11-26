import React from 'react'
import ReactDOM from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './assets/styles/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Reload once when a new service worker takes control. The generated
// registerSW.js only registers the worker, so without this a cached shell can
// keep serving the previous bundle after a deployment.
registerSW({ immediate: true })

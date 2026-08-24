import React from 'react'
import ReactDOM from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App.jsx'
import './index.css'

// Firebase authorizes hostnames exactly. Local Firebase projects include
// localhost by default, but not the equivalent 127.0.0.1 hostname.
if (window.location.hostname === '127.0.0.1') {
  const url = new URL(window.location.href)
  url.hostname = 'localhost'
  window.location.replace(url)
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <Toaster richColors position="top-right" closeButton />
      <App />
    </React.StrictMode>,
  )
}

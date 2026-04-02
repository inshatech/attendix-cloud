import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { useBrand } from './store/brand.js'

// Kick off brand fetch immediately — updates document.title + favicon as soon as it resolves
useBrand.getState().load()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

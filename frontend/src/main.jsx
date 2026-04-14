import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import BackendGate from './components/BackendGate.jsx'
import { ThemeProvider } from './ThemeContext.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          height: '100vh', background: '#080810', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace',
        }}>
          <div style={{
            background: '#1a0808', border: '1px solid #3a1a1a', borderRadius: 12,
            padding: '32px 40px', maxWidth: 560, color: '#f87171',
          }}>
            <div style={{ fontSize: 20, marginBottom: 12 }}>⚠ App Error</div>
            <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: '#f87171', margin: 0 }}>
              {this.state.error?.message}
            </pre>
            <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', color: '#666', marginTop: 12 }}>
              {this.state.error?.stack?.split('\n').slice(1, 5).join('\n')}
            </pre>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 20, background: '#3a1a1a', border: '1px solid #6a2a2a',
                borderRadius: 6, padding: '6px 16px', color: '#f87171',
                cursor: 'pointer', fontSize: 12, fontFamily: 'monospace',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <BackendGate>
          <App />
        </BackendGate>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)

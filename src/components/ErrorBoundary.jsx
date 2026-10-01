import { Component } from 'react'

// Catches render errors (and failed lazy-chunk loads) anywhere below it so a
// single broken page doesn't blank the whole app.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught an error:', error, info?.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-gc-green-700">Something went wrong</h1>
          <p className="mt-2 text-sm text-gray-600">
            This page failed to load. Try again, or reload the app.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-4 max-h-40 overflow-auto rounded bg-gray-100 p-3 text-left text-xs text-red-700">
              {String(this.state.error?.message || this.state.error)}
            </pre>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-lg border border-gc-green-700 px-4 py-2 text-sm font-semibold text-gc-green-700"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-lg bg-gc-green-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    )
  }
}

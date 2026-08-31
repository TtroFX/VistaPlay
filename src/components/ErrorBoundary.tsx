import { Component, type ErrorInfo, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {}
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('VistaPlay render failure', { category: 'render', error, info }) }
  render() {
    if (this.state.error) return <main className="fatal-error"><span>V</span><h1>表示を続けられませんでした</h1><p>{this.state.error.message}</p><button onClick={() => window.location.reload()}>安全に再読み込み</button></main>
    return this.props.children
  }
}

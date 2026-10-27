import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** What broke, for the message: "this tab", "this quest's panel". */
  what: string
  /**
   * Shown in place of a whole tab (fills the workspace), a panel (fits in it), or a bar (the top bar,
   * search, status bar or Settings: one line, since 1.65.0).
   */
  variant: 'tab' | 'panel' | 'bar'
  children: ReactNode
}

interface State {
  error: Error | null
  /** Bumped by Reload, so the children mount afresh. */
  attempt: number
}

/**
 * Keeps an error while drawing one tab or panel from blanking the whole window: it says what went wrong
 * and offers to load that part again; everything else keeps working.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, attempt: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`Error in ${this.props.what}:`, error, info.componentStack)
  }

  render(): ReactNode {
    const { error, attempt } = this.state
    if (!error) return <Fragment key={attempt}>{this.props.children}</Fragment>
    const reload = (): void => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))
    if (this.props.variant === 'bar')
      return (
        <div className="error-bar" role="alert" title={error.message || String(error)}>
          Something went wrong in {this.props.what}.{' '}
          <button className="link small" onClick={reload}>
            Reload it
          </button>
        </div>
      )
    const body = (
      <div className="error-boundary" role="alert">
        <p>
          <strong>Something went wrong in {this.props.what}.</strong> The rest of the app still works.
        </p>
        <pre>{error.message || String(error)}</pre>
        <button className="button" onClick={reload}>
          Reload {this.props.variant === 'tab' ? 'tab' : 'panel'}
        </button>
      </div>
    )
    return this.props.variant === 'tab' ? (
      <main className="error-tab">{body}</main>
    ) : (
      <aside className="quest-detail">{body}</aside>
    )
  }
}

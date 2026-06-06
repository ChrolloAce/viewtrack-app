import { Component, type ReactNode } from 'react';

/** Renders `fallback` if its children throw (e.g. a native module missing
 *  before a rebuild) instead of crashing the whole screen. */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

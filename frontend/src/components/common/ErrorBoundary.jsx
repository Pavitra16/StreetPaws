import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <div className="text-4xl" aria-hidden="true">
            ⚠️
          </div>
          <h1 className="mt-3 text-lg font-semibold">Something went wrong</h1>
          <p className="mt-1 text-sm text-stone-500">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Reload the page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

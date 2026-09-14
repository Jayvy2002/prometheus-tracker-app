import { Component, type ReactNode } from 'react';
import i18n from '../i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('Prometheus render error', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 py-12">
          <img src="/logo.svg" alt="Prometheus" className="w-14 h-14 mb-6" />
          <h1 className="text-2xl font-semibold text-center mb-2">{i18n.t('errors.renderError')}</h1>
          <p className="text-sm text-neutral-400 text-center mb-8 max-w-sm">{i18n.t('errors.dataSafe')}</p>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false })}
              className="min-h-11 flex-1 rounded-xl bg-blue-600 text-white font-medium"
            >
              {i18n.t('errors.retry')}
            </button>
            <a
              href="/dashboard"
              className="min-h-11 flex-1 rounded-xl bg-neutral-800 text-neutral-200 font-medium inline-flex items-center justify-center"
            >
              {i18n.t('errors.goHome')}
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { Component, type ReactNode } from 'react';
import i18n from '../i18n';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#000',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'monospace',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️ {i18n.t('errors.renderError')}</div>
          <div style={{
            background: '#1a1a1a',
            border: '1px solid #ef4444',
            borderRadius: '8px',
            padding: '1.5rem',
            maxWidth: '800px',
            width: '100%',
            overflowX: 'auto',
          }}>
            <div style={{ color: '#ef4444', fontWeight: 'bold', marginBottom: '0.5rem' }}>
              {this.state.error?.name}: {this.state.error?.message}
            </div>
            {import.meta.env.DEV && (
            <pre style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'pre-wrap' }}>
              {this.state.error?.stack}
            </pre>
            )}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1.5rem',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {i18n.t('errors.retry')}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

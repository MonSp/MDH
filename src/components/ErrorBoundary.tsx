import React, { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
          padding: '2rem',
          color: 'var(--text-primary, #e0e0e0)',
          background: 'var(--bg-primary, #1a1a2e)',
          borderRadius: '12px',
          border: '1px solid rgba(255, 100, 100, 0.3)',
          margin: '1rem',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⚠️</div>
          <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem' }}>组件渲染出错</h3>
          <p style={{
            margin: '0 0 1rem',
            fontSize: '0.85rem',
            color: 'var(--text-secondary, #888)',
            textAlign: 'center',
            maxWidth: '400px',
          }}>
            {this.state.error?.message || '发生未知错误'}
          </p>
          <button
            onClick={this.handleReset}
            style={{
              padding: '0.5rem 1.5rem',
              background: 'rgba(100, 149, 237, 0.2)',
              border: '1px solid rgba(100, 149, 237, 0.4)',
              borderRadius: '8px',
              color: 'var(--text-primary, #e0e0e0)',
              cursor: 'pointer',
              fontSize: '0.9rem',
            }}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

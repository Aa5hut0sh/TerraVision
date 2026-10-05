import React, { Component, ErrorInfo, ReactNode } from 'react';
import { useAppStore } from './store';
import { Landing } from './screens/Landing';
import { Processing } from './screens/Processing';
import { Viewer } from './screens/Viewer';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#f4efe6] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white brutal-border brutal-shadow-lg p-6 space-y-4">
            <div className="flex items-center gap-2 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-xl font-black uppercase">Something went wrong</h2>
            </div>
            <p className="text-xs font-mono text-zinc-700 bg-zinc-100 p-3 brutal-border-sm overflow-x-auto">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <Button
              variant="primary"
              onClick={() => window.location.reload()}
              icon={<RefreshCw className="w-4 h-4" />}
              className="w-full"
            >
              Reload Application
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const screen = useAppStore(state => state.screen);

  return (
    <ErrorBoundary>
      {screen === 'landing' && <Landing />}
      {screen === 'processing' && <Processing />}
      {screen === 'viewer' && <Viewer />}
    </ErrorBoundary>
  );
};

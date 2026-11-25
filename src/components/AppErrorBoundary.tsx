import React from 'react';
import { reportClientError } from '../utils/errorReporter';

interface State {
  hasError: boolean;
}

/** Si una pantalla se rompe, muestra un aviso con "Recargar" en lugar de una página en blanco. */
export class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    reportClientError(error, `Pantalla rota${info.componentStack ? ` (${info.componentStack.trim().split('\n')[0].trim()})` : ''}`);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-6 text-center space-y-3 shadow-sm">
          <h1 className="text-base font-bold text-slate-900">Algo salió mal</h1>
          <p className="text-sm text-slate-600">
            Ya registramos el problema. Tus datos están guardados. Probá recargar la página.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full px-4 py-2.5 rounded-xl bg-[#0B1933] hover:bg-[#13264A] text-white text-sm font-bold cursor-pointer"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}

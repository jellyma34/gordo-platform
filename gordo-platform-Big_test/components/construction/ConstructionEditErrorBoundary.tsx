"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

/**
 * Ловит падения рендера в /edit/construction (и вложенных клиентских деревьев).
 */
export class ConstructionEditErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Construction edit error:", error, errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="mx-auto min-h-[40vh] w-full min-w-0 max-w-lg px-4 py-8">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center shadow-sm">
            <p className="font-medium text-amber-950">Ошибка загрузки данных</p>
            {this.state.error ? (
              <p className="mt-2 break-words font-mono text-xs text-amber-900/80">{this.state.error.message}</p>
            ) : null}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-950 shadow-sm hover:bg-amber-100"
            >
              Перезагрузить
            </button>
          </div>
        </section>
      );
    }
    return this.props.children;
  }
}

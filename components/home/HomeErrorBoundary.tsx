"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };

type State = { hasError: boolean; message: string | null };

/**
 * Ошибки рендера дочерних компонентов; try/catch вокруг `<HomePage />` их не поймёт.
 */
export class HomeErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err?.message ?? "Неизвестная ошибка" };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error("HomeErrorBoundary:", err, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-lg p-6">
          <h1 className="text-lg font-semibold text-slate-900">Ошибка рендера</h1>
          <p className="mt-2 text-sm text-slate-600">
            {this.state.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

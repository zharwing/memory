import { Component, type ErrorInfo, type ReactNode } from "react";
import { createPublicError, type PublicError, type PublicRecoveryAction } from "@zharwing/memory-core";
import type {
  DiagnosticJournal,
  DiagnosticSurface
} from "../../platform/diagnostics/index.js";
import { useDiagnosticJournal } from "./DiagnosticJournalContext.js";
import { RecoveryPanel } from "./RecoveryPanel.js";

interface RecoveryBoundaryProps {
  readonly children: ReactNode;
  readonly surface: Extract<DiagnosticSurface, "root" | "route">;
  readonly resetKey?: string;
  readonly onReset?: () => void | Promise<void>;
}

interface RecoveryBoundaryState {
  readonly error?: PublicError;
}

interface OwnedRecoveryBoundaryProps extends RecoveryBoundaryProps {
  readonly diagnostics: DiagnosticJournal;
}

/** React crash boundary that stores only a classified public error. */
class OwnedRecoveryBoundary extends Component<OwnedRecoveryBoundaryProps, RecoveryBoundaryState> {
  state: RecoveryBoundaryState = {};
  #lastFocused: HTMLElement | null = null;

  static getDerivedStateFromError(): RecoveryBoundaryState {
    return { error: createPublicError("internal") };
  }

  componentDidCatch(error: unknown, _info: ErrorInfo): void {
    this.#lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.props.diagnostics.recordFailure({ name: "failure.caught", surface: this.props.surface }, error);
  }

  componentDidUpdate(previous: RecoveryBoundaryProps): void {
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: undefined }, () => {
        if (this.#lastFocused?.isConnected) this.#lastFocused.focus();
      });
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <RecoveryPanel
        error={this.state.error}
        surface={this.props.surface}
        title={this.props.surface === "root" ? "The app needs to recover" : "This page needs to recover"}
        onRecover={(action) => this.recover(action)}
      />
    );
  }

  private async recover(action: PublicRecoveryAction): Promise<void> {
    if (action === "reload" || action === "restart-service" || action === "unlock-session") {
      location.reload();
      return;
    }
    await this.props.onReset?.();
    this.setState({ error: undefined }, () => {
      if (this.#lastFocused?.isConnected) this.#lastFocused.focus();
    });
  }
}

export function RecoveryBoundary(props: RecoveryBoundaryProps) {
  const diagnostics = useDiagnosticJournal();
  return <OwnedRecoveryBoundary {...props} diagnostics={diagnostics} />;
}

export function RootRecoveryBoundary({ children }: { readonly children: ReactNode }) {
  return <RecoveryBoundary surface="root">{children}</RecoveryBoundary>;
}

export function RouteRecoveryBoundary({
  children,
  resetKey,
  onReset
}: {
  readonly children: ReactNode;
  readonly resetKey: string;
  readonly onReset?: () => void | Promise<void>;
}) {
  return (
    <RecoveryBoundary surface="route" resetKey={resetKey} onReset={onReset}>
      {children}
    </RecoveryBoundary>
  );
}

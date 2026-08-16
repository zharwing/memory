import type {
  PublicError,
  PublicMessageId,
  PublicRecoveryAction
} from "@zharwing/memory-core";

const PUBLIC_MESSAGE_COPY: Readonly<Record<PublicMessageId, string>> = Object.freeze({
  "operation.validation": "Check the entered values and try again.",
  "operation.unauthorized": "This session is locked. Unlock it before continuing.",
  "operation.forbidden": "This action is not allowed for the current session.",
  "operation.not_found": "The requested item is no longer available.",
  "operation.conflict": "The data changed elsewhere. Refresh before trying again.",
  "operation.unavailable": "The local memory service is unavailable.",
  "operation.timeout": "The service did not respond. Reconcile before retrying.",
  "operation.cancelled": "The operation was cancelled before it completed.",
  "operation.protocol": "The service returned a response this app cannot safely use.",
  "operation.compatibility": "This app and the local service are not compatible.",
  "operation.outcome_unknown": "The result is unknown. Reconcile before trying again.",
  "operation.internal": "The operation could not be completed."
});

const RECOVERY_ACTION_COPY: Readonly<Record<PublicRecoveryAction, string>> = Object.freeze({
  "review-input": "Review fields",
  "unlock-session": "Reload to unlock",
  "return": "Go back",
  "refresh": "Refresh",
  "retry": "Try again",
  "reconcile": "Reconcile",
  "reload": "Reload app",
  "restart-service": "Reload after restarting service"
});

const RECOVERY_FAILURE_COPY =
  "Recovery did not complete. The current information and controls remain available; review the latest state and try again.";

/** Closed, safe public copy authority; callers must not stringify unknown failures. */
export class PublicErrorPresenter {
  present(error: PublicError | undefined): string {
    return error ? this.message(error.messageId) : "";
  }

  message(messageId: PublicMessageId): string {
    return PUBLIC_MESSAGE_COPY[messageId];
  }

  recoveryAction(action: PublicRecoveryAction): string {
    return RECOVERY_ACTION_COPY[action];
  }

  recoveryFailure(): string {
    return RECOVERY_FAILURE_COPY;
  }
}

/** The single application-owned presenter instance. */
export const publicErrorPresenter = Object.freeze(new PublicErrorPresenter());

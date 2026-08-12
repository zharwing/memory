import type {
  PublicMessageId,
  PublicRecoveryAction
} from "@zharwing/memory-core";

/** Owned English copy selected only by a closed message identifier. */
export function publicMessageCopy(messageId: PublicMessageId): string {
  switch (messageId) {
    case "operation.validation": return "Check the entered values and try again.";
    case "operation.unauthorized": return "This session is locked. Unlock it before continuing.";
    case "operation.forbidden": return "This action is not allowed for the current session.";
    case "operation.not_found": return "The requested item is no longer available.";
    case "operation.conflict": return "The data changed elsewhere. Refresh before trying again.";
    case "operation.unavailable": return "The local memory service is unavailable.";
    case "operation.timeout": return "The service did not respond. Reconcile before retrying.";
    case "operation.cancelled": return "The operation was cancelled before it completed.";
    case "operation.protocol": return "The service returned a response this app cannot safely use.";
    case "operation.compatibility": return "This app and the local service are not compatible.";
    case "operation.outcome_unknown": return "The result is unknown. Reconcile before trying again.";
    case "operation.internal": return "The operation could not be completed.";
  }
}

export function recoveryActionCopy(action: PublicRecoveryAction): string {
  switch (action) {
    case "review-input": return "Review fields";
    case "unlock-session": return "Reload to unlock";
    case "return": return "Go back";
    case "refresh": return "Refresh";
    case "retry": return "Try again";
    case "reconcile": return "Reconcile";
    case "reload": return "Reload app";
    case "restart-service": return "Reload after restarting service";
  }
}

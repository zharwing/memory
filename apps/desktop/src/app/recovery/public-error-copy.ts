import type { PublicMessageId, PublicRecoveryAction } from "@zharwing/memory-core";
import { publicErrorPresenter } from "../../application/errors/public-error-presenter.js";

/** Compatibility facade for recovery UI; copy ownership lives in the application presenter. */
export function publicMessageCopy(messageId: PublicMessageId): string {
  return publicErrorPresenter.message(messageId);
}

export function recoveryActionCopy(action: PublicRecoveryAction): string {
  return publicErrorPresenter.recoveryAction(action);
}

export function recoveryFailureCopy(): string {
  return publicErrorPresenter.recoveryFailure();
}

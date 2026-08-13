import type {
  ScopeToken,
  ScopedProjectPort,
  StoreSchedulerPort
} from "../../application/operations/store-ports.js";
import type { SemanticPollResult } from "./semantic-types.js";

const POLL_BACKOFF_MS = [2_000, 4_000, 8_000, 16_000, 30_000] as const;
const POLL_SUCCESS_DELAY_MS = 2_000;

interface PollFlight {
  readonly scope: ScopeToken;
  readonly epoch: number;
  readonly promise: Promise<SemanticPollResult>;
}

export interface SemanticPollControllerOptions {
  readonly scope: ScopedProjectPort;
  readonly scheduler: StoreSchedulerPort;
  readonly canUse: (scope: ScopeToken) => boolean;
  readonly performPoll: (scope: ScopeToken) => Promise<SemanticPollResult>;
}

/** Owns polling policy and lifecycle; the store callback remains commit authority. */
export class SemanticPollController {
  private foreground = true;
  private desired = false;
  private pollingScope: ScopeToken | undefined = undefined;
  private failures = 0;
  private epoch = 0;
  private inFlight: PollFlight | undefined = undefined;
  private scheduledHandle: ReturnType<typeof setTimeout> | undefined = undefined;
  private disposed = false;

  constructor(private readonly options: SemanticPollControllerOptions) {}

  /** Read-only compatibility view exposed by SemanticStore.pollHandle. */
  get handle(): ReturnType<typeof setTimeout> | undefined {
    return this.scheduledHandle;
  }

  setForeground(foreground: boolean, analysisActive: boolean): void {
    if (this.disposed || this.foreground === foreground) return;
    this.foreground = foreground;
    if (!foreground) {
      this.cancelScheduled();
      return;
    }

    const scope = this.options.scope.captureScope();
    if (
      scope &&
      this.options.scope.isScopeCurrent(scope) &&
      (this.desired || analysisActive)
    ) {
      this.desired = true;
      this.pollingScope = scope;
      this.schedule(0, true);
    }
  }

  start(scope: ScopeToken): void {
    if (this.disposed || !this.options.canUse(scope)) return;
    if (this.pollingScope !== scope) {
      this.cancelScheduled();
      this.pollingScope = scope;
      this.failures = 0;
      this.epoch += 1;
    }
    this.desired = true;
    this.schedule(0, true);
  }

  stop(): void {
    this.desired = false;
    this.pollingScope = undefined;
    this.failures = 0;
    this.epoch += 1;
    this.cancelScheduled();
  }

  /** Detaches an old carrier so a new project generation can start immediately. */
  reset(): void {
    this.inFlight = undefined;
    this.failures = 0;
    this.stop();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
  }

  private cancelScheduled(): void {
    if (this.scheduledHandle === undefined) return;
    this.options.scheduler.clearTimeout(this.scheduledHandle);
    this.scheduledHandle = undefined;
  }

  private schedule(delayMs: number, replace = false): void {
    const scope = this.pollingScope;
    if (!scope || !this.shouldPoll(scope, this.epoch) || this.inFlight) return;
    if (this.scheduledHandle !== undefined) {
      if (!replace) return;
      this.cancelScheduled();
    }

    const epoch = this.epoch;
    this.scheduledHandle = this.options.scheduler.setTimeout(() => {
      this.scheduledHandle = undefined;
      void this.pollOnce(scope, epoch);
    }, delayMs);
  }

  private async pollOnce(scope: ScopeToken, epoch: number): Promise<void> {
    if (!this.shouldPoll(scope, epoch) || this.inFlight) return;

    const flight: PollFlight = {
      scope,
      epoch,
      promise: this.options.performPoll(scope)
    };
    this.inFlight = flight;
    const result = await flight.promise;

    if (this.inFlight === flight) this.inFlight = undefined;
    if (!this.shouldPoll(scope, epoch)) return;

    if (result === "active") {
      this.failures = 0;
      this.schedule(POLL_SUCCESS_DELAY_MS);
      return;
    }
    if (result === "superseded") {
      this.schedule(POLL_SUCCESS_DELAY_MS);
      return;
    }
    if (result === "failure") {
      this.failures += 1;
      const delay = POLL_BACKOFF_MS[Math.min(this.failures - 1, POLL_BACKOFF_MS.length - 1)];
      this.schedule(delay);
    }
  }

  private shouldPoll(scope: ScopeToken, epoch: number): boolean {
    return !this.disposed &&
      this.foreground &&
      this.desired &&
      this.pollingScope === scope &&
      this.epoch === epoch &&
      this.options.canUse(scope);
  }
}

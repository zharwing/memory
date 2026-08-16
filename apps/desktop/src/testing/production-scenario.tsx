import { type ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import {
  OperationClient,
  type ClientRuntime
} from "@zharwing/memory-api-client";
import { App } from "../App.js";
import { createAppRuntime, type AppRuntime } from "../app/composition/runtime.js";
import type { AppServices, Scheduler } from "../app/composition/ports.js";
import { DiagnosticJournalProvider } from "../app/recovery/DiagnosticJournalContext.js";
import {
  LocalDiagnosticJournal,
  type SafeDiagnosticEvent
} from "../platform/diagnostics/diagnostic-journal.js";
import { StoreProvider } from "../stores/store-context.js";
import { FIXTURE_NOW } from "./fixture-data.js";
import { FakeMemoryTransport } from "./fake-memory-transport.js";
import { createLocalGraphPositionStore } from "../features/graph/persistence/graph-position-store.js";
import { LocalResourceInvalidationBus } from "../application/resources/resource-invalidation-bus.js";
import { getFrontendScenario, type FrontendScenario } from "./scenario-registry.js";
import { createAppPersistence } from "../application/persistence/app-persistence.js";

export interface ProductionScenarioHarness {
  readonly scenario: FrontendScenario;
  readonly transport: FakeMemoryTransport;
  readonly runtime: AppRuntime;
  readonly diagnostics: readonly ScenarioDiagnosticEvent[];
  readonly element: ReactElement;
  dispose(): void;
}

export type ScenarioDiagnosticEvent = SafeDiagnosticEvent;

/**
 * Creates the real application runtime, store graph, App route tree and screen
 * components around the in-memory carrier. Only the external effect boundary
 * is fake. Nothing here is imported by the production entrypoint.
 */
export function createProductionScenario(id: string): ProductionScenarioHarness {
  const scenario = getFrontendScenario(id);
  const transport = new FakeMemoryTransport(scenario.transport);
  const clock = new ControlledScenarioClock();
  const diagnostics = new LocalDiagnosticJournal();
  const preferences = new Map<string, string>();
  const services: AppServices = {
    memory: new OperationClient(transport, clock.clientRuntime, "desktop"),
    clock: { now: () => new Date(FIXTURE_NOW) },
    ids: { create: () => clock.nextId() },
    persistence: createAppPersistence({
      get: (key) => preferences.get(key),
      set: (key, value) => value === undefined ? preferences.delete(key) : void preferences.set(key, value)
    }, createLocalGraphPositionStore()),
    diagnostics,
    scheduler: clock.scheduler,
    invalidations: new LocalResourceInvalidationBus()
  };
  const runtime = createAppRuntime(services);
  let disposed = false;
  const harness: ProductionScenarioHarness = {
    scenario,
    transport,
    runtime,
    get diagnostics() {
      return diagnostics.snapshot();
    },
    element: <ProductionScenarioApp scenario={scenario} runtime={runtime} />,
    dispose() {
      if (disposed) return;
      disposed = true;
      runtime.dispose();
      clock.dispose();
      preferences.clear();
    }
  };
  return Object.freeze(harness);
}

export function ProductionScenarioApp({ scenario, runtime }: {
  scenario: FrontendScenario;
  runtime: AppRuntime;
}) {
  return (
    <div
      data-frontend-scenario={scenario.id}
      data-scenario-theme={scenario.capabilities.theme}
      data-scenario-reduced-motion={scenario.capabilities.reducedMotion || undefined}
      data-scenario-forced-colors={scenario.capabilities.forcedColors || undefined}
      data-scenario-coarse-pointer={scenario.capabilities.coarsePointer || undefined}
      data-scenario-hover={scenario.capabilities.hover}
      dir={scenario.capabilities.direction ?? "ltr"}
    >
      <DiagnosticJournalProvider journal={runtime.diagnostics}>
        <StoreProvider runtime={runtime}>
          <MemoryRouter initialEntries={[scenario.route]}>
            <App />
          </MemoryRouter>
        </StoreProvider>
      </DiagnosticJournalProvider>
    </div>
  );
}

class ControlledScenarioClock {
  readonly #callbacks = new Map<number, () => void>();
  #sequence = 0;

  readonly clientRuntime: ClientRuntime = {
    createId: () => this.nextId("operation"),
    setTimeout: (callback) => this.register(callback) as unknown as ReturnType<typeof setTimeout>,
    clearTimeout: (handle) => this.#callbacks.delete(handle as unknown as number)
  };

  readonly scheduler: Scheduler = {
    setTimeout: (callback) => this.register(callback) as unknown as ReturnType<typeof setTimeout>,
    clearTimeout: (handle) => this.#callbacks.delete(handle as unknown as number),
    setInterval: (callback) => this.register(callback) as unknown as ReturnType<typeof setInterval>,
    clearInterval: (handle) => this.#callbacks.delete(handle as unknown as number)
  };

  nextId(prefix = "scenario"): string {
    this.#sequence += 1;
    return `${prefix}-${this.#sequence}`;
  }

  dispose(): void {
    this.#callbacks.clear();
  }

  private register(callback: () => void): number {
    this.#sequence += 1;
    this.#callbacks.set(this.#sequence, callback);
    return this.#sequence;
  }
}

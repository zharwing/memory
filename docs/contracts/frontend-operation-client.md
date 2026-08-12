# Frontend operation contract and client

This document records the runtime boundary introduced by `MEM-FE01`. The core
contract is executable code; this document explains ownership and review
expectations.

## One operation authority

`packages/core/src/contracts/operation-registry.ts` is the only production
authority for control-plane method names, input and output decoders, effect
class, audiences, project scope, privacy projection, cancellation,
idempotency, timeout, response-size limit, invalidations, wire version, and
public errors. The daemon parses every registered input and validates every
registered output through that authority. Adding a switch case without a
registry entry, or a registry entry without a switch case, is a test failure.

External request and response values remain `unknown` until a runtime schema
parses them. A TypeScript generic or cast is never treated as validation.

## Carrier and parsing ownership

The `MemoryTransport` implementations own carrier details only:

- the browser carrier owns the HTTP endpoint, headers, body transfer, and byte
  accounting;
- the Tauri carrier owns the invoke command and byte accounting;
- test carriers own deterministic delivery but use the same client.

`OperationClient` owns input/output decoding, request correlation, timeout and
cancellation linking, HTTP/content-type/envelope checks, compatibility, and
the closed public error algebra. A lost connection for a dispatched mutation
becomes `outcome_unknown`; the client does not silently retry it.

The desktop UI receives only the narrow `MemoryClient.operation` surface.
`ZharwingMemoryClient.call` and the agent facade exist solely for non-UI CLI
and MCP compatibility. A reachability test prevents desktop code from
importing carriers, constructing the compatibility client outside composition
roots, or calling raw RPC methods.

## Composition and lifecycle

The browser and Tauri roots create `AppServices`: memory, clock, ID source, UI
preferences, diagnostics, and scheduler. `createAppRuntime` owns exactly one
`RootStore` graph. React StrictMode borrows that runtime; rendering never
constructs it. Runtime and store disposal are idempotent, and scheduler-backed
polling owns at most one interval.

No composition path requires a live daemon, browser global, secret, private
memory project, decorator, reflection, or DI container. Tests inject
contract-faithful carriers and services.

## Public failures

Wire failures use a closed tuple of `code`, `messageId`, `category`, and
`retry`. The decoder rejects incoherent tuples. The control-plane wire never
publishes an exception stack, provider body, private path, document content,
credential, or arbitrary exception text. User-visible text is owned by the
application and selected from the registered message ID.

Diagnostics that need internal detail belong to a separate bounded local
diagnostic sink; they are not part of the public response.

import crypto from "node:crypto";
import http from "node:http";
import {
  AGENT_OPERATIONS,
  RPC_COMPATIBILITY_VERSION,
  createPublicError,
  extractOperationProjectId,
  getOperationDefinition,
  isLoopbackHost,
  isOperationName,
  operationsForAudience,
  parseOperationInput,
  rpcError,
  type AuthenticatedPrincipal,
  type OperationName,
  type RpcRequest,
  type RpcResponse
} from "@zharwing/memory-core";
import {
  decodeMemoryToolCall,
  deriveMcpMutationIdempotencyKey,
  handleMcpJsonRpcPayload,
  MEMORY_TOOLS,
  type McpToolCall
} from "@zharwing/memory-mcp";
import { dispatchAgentRpc, dispatchAuthorizedAgentRpc } from "./agent-facade.js";
import { type DaemonConfig } from "./config.js";
import { MemoryService } from "./memory-service.js";
import { createDaemonApplication } from "./application/create-daemon-application.js";
import { dispatchAuthorizedRpc, dispatchRpc } from "./rpc.js";
import {
  AuthorityService,
  createOpaqueCredential,
  cryptoAuthorityIds,
  systemAuthorityClock,
  type AuthorityClock
} from "./services/authority-service.js";
import {
  BROWSER_SESSION_COOKIE,
  BrowserSessionService,
  type BrowserBootstrapGrant
} from "./services/browser-session-service.js";
import {
  OperationRegistrar,
  type AdmissionEndpoint
} from "./services/operation-registrar.js";
import {
  OperationEffectJournal,
  operationEffectNamespace
} from "./services/effect-journal.js";

export const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

export interface DaemonAdmissionServices {
  readonly authority: AuthorityService;
  readonly browserSessions: BrowserSessionService;
  readonly registrar: OperationRegistrar;
}

export interface DaemonServerDependencies {
  readonly service?: MemoryService;
  readonly admission?: DaemonAdmissionServices;
}

export interface AgentCredentialGrant {
  readonly credential: string;
  readonly principalId: string;
  readonly sessionOwner: string;
  readonly projectId: string;
  readonly ttlMs: number;
  readonly policyDigest?: string;
}

export function createDaemonAdmissionServices(
  config: DaemonConfig,
  clock: AuthorityClock = systemAuthorityClock()
): DaemonAdmissionServices {
  assertSecureDaemonConfig(config);
  const authority = new AuthorityService(clock, cryptoAuthorityIds());
  // The compatibility token is converted to immutable claims at startup. It
  // is never copied into a response, browser session, diagnostic, or log.
  if (config.authMode === "token" && config.authToken) {
    authority.registerCredential(config.authToken, {
      principalId: "local-admin",
      sessionOwner: "daemon-config",
      audience: "admin",
      operations: operationsForAudience("admin"),
      projectId: null,
      ttlMs: 24 * 60 * 60_000,
      policyDigest: `profile:${config.profile}`,
      rotationId: "daemon-config-rotation",
      revocationId: "daemon-config-revocation"
    });
  }
  const browserSessions = new BrowserSessionService(authority, clock);
  const admission = {
    authority,
    browserSessions,
    registrar: new OperationRegistrar(authority, clock, {
      effectJournal: new OperationEffectJournal({
        namespace: operationEffectNamespace(config.memoryRoot)
      })
    })
  };
  if (config.profile === "hardened-local" && config.agentSurfaceEnabled) {
    if (!config.agentCredential || !config.agentProjectId) {
      throw new Error("Hardened agent surface requires a distinct project-bound credential.");
    }
    registerAgentCredential(admission, {
      credential: config.agentCredential,
      principalId: "configured-local-agent",
      sessionOwner: "daemon-config-agent",
      projectId: config.agentProjectId,
      ttlMs: 24 * 60 * 60_000,
      policyDigest: "profile:hardened-local:agent"
    });
  }
  if (config.desktopCredential) {
    admission.authority.registerCredential(config.desktopCredential, {
      principalId: "native-desktop",
      sessionOwner: "tauri-native-host",
      audience: "desktop",
      operations: operationsForAudience("desktop"),
      projectId: config.desktopProjectId ?? null,
      ttlMs: 12 * 60 * 60_000,
      policyDigest: "profile:hardened-local:native-desktop"
    });
  }
  return admission;
}

/**
 * Trusted host composition hook for a distinct, project-bound agent bearer.
 * It has no HTTP route, does not reuse the admin credential, and retains only
 * the credential digest inside AuthorityService.
 */
export function registerAgentCredential(
  admission: DaemonAdmissionServices,
  grant: AgentCredentialGrant
): AuthenticatedPrincipal<OperationName> {
  if (!grant.projectId) throw new Error("Agent credential requires an exact project binding.");
  return admission.authority.registerCredential(grant.credential, {
    principalId: grant.principalId,
    sessionOwner: grant.sessionOwner,
    audience: "agent",
    operations: AGENT_OPERATIONS,
    projectId: grant.projectId,
    ttlMs: grant.ttlMs,
    policyDigest: grant.policyDigest
  });
}

/** Creates an opaque value for a trusted host to deliver out-of-band. */
export function createAgentCredential(): string {
  return createOpaqueCredential();
}

export function createDaemonServer(
  config: DaemonConfig,
  serviceOrDependencies: MemoryService | DaemonServerDependencies = createDaemonApplication(config)
) {
  assertSecureDaemonConfig(config);
  const dependencies = isDependencies(serviceOrDependencies)
    ? serviceOrDependencies
    : { service: serviceOrDependencies };
  const service = dependencies.service ?? createDaemonApplication(config);
  const admission = dependencies.admission ?? createDaemonAdmissionServices(config);
  const allowPersonalPreviewTokenFallback = config.profile === "personal-preview" && config.authMode === "none";

  const server = http.createServer(async (request, response) => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");

    if (!hasLoopbackHostHeader(request)) {
      sendError(response, 403, "forbidden");
      return;
    }
    if (!setCorsHeaders(request, response)) {
      sendError(response, 403, "forbidden");
      return;
    }
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    // GET/HEAD are inert. Authentication/bootstrap/session mutation is POST
    // only, so prefetch and link traversal cannot create authority.
    if ((request.method === "GET" || request.method === "HEAD") && request.url === "/health") {
      response.statusCode = 200;
      response.end(request.method === "HEAD" ? "" : JSON.stringify({ status: "ok" }));
      return;
    }
    if ((request.method === "GET" || request.method === "HEAD") && request.url === "/") {
      const body = JSON.stringify({
        status: "ok",
        service: "Zharwing Memory daemon",
        message: "This is the local daemon API, not the desktop UI.",
        endpoints: { health: "/health", rpc: "/rpc", mcp: "/mcp" }
      });
      response.statusCode = 200;
      response.end(request.method === "HEAD" ? "" : body);
      return;
    }
    if (request.method === "HEAD") {
      sendError(response, 404, "not_found");
      return;
    }

    try {
      if (
        request.method === "POST" &&
        request.url === "/browser-session/bootstrap"
      ) {
        await handleBrowserBootstrap(request, response, admission.browserSessions);
        return;
      }
      if (
        request.method === "POST" &&
        request.url === "/browser-session/rotate"
      ) {
        await handleBrowserRotate(request, response, admission.browserSessions, allowPersonalPreviewTokenFallback);
        return;
      }
      if (
        request.method === "POST" &&
        request.url === "/browser-session/project"
      ) {
        await handleBrowserProject(request, response, admission.browserSessions, allowPersonalPreviewTokenFallback);
        return;
      }
      if (
        request.method === "POST" &&
        request.url === "/browser-session/revoke"
      ) {
        await handleBrowserRevoke(request, response, admission.browserSessions, allowPersonalPreviewTokenFallback);
        return;
      }
      if (
        config.profile === "personal-preview" &&
        config.authMode === "none" &&
        request.method === "POST" &&
        request.url === "/browser-session/preview"
      ) {
        await handleBrowserPreview(request, response, admission.browserSessions, service);
        return;
      }

      if (request.method !== "POST" || !["/rpc", "/mcp", "/agent-rpc"].includes(request.url || "")) {
        sendError(response, 404, "not_found");
        return;
      }
      if (["/mcp", "/agent-rpc"].includes(request.url || "") && !config.agentSurfaceEnabled) {
        sendError(response, 403, "forbidden");
        return;
      }

      // A recognized non-browser principal always enters the registrar, even
      // while the daemon keeps personal-preview compatibility enabled. This
      // prevents a native/agent bearer from being silently downgraded to the
      // legacy raw dispatcher merely because native requests have no Origin.
      const authenticated = authenticateHardenedRequest(admission, request, allowPersonalPreviewTokenFallback);
      if (
        config.profile === "personal-preview" &&
        !request.headers.origin &&
        (!authenticated || authenticated.principalId === "local-admin")
      ) {
        await handlePersonalPreviewRequest(config, service, request, response);
        return;
      }
      if (!authenticated) {
        sendError(response, 401, "unauthorized");
        return;
      }
      if (
        (request.url === "/mcp" || request.url === "/agent-rpc") &&
        authenticated.audience !== "agent"
      ) {
        sendError(response, 403, "forbidden");
        return;
      }
      const body = await readRequestBody(request);
      if (request.url === "/mcp") {
        await handleHardenedMcp(service, admission, request, response, authenticated, body);
        return;
      }
      const endpoint = request.url as AdmissionEndpoint;
      const parsedRpcRequest = parseRpcRequest(body);
      const rpcRequest = endpoint === "/agent-rpc"
        ? await bindAgentStartupRequest(service, authenticated, parsedRpcRequest)
        : parsedRpcRequest;
      const authorized = admission.registrar.authorize(
        await admissionContextForRpc(service, endpoint, request, authenticated, rpcRequest),
        rpcRequest
      );
      if (!authorized.ok) {
        sendError(response, authorized.status, authorized.error.code, rpcRequest.id);
        return;
      }
      const rpcResponse = endpoint === "/agent-rpc"
        ? await service.withDomainEffect(
          authorized.invocation.domainEffect,
          () => dispatchAuthorizedAgentRpc(service, authorized.invocation)
        )
        : await dispatchAuthorizedRpc(service, authorized.invocation);
      if (
        rpcResponse.ok &&
        authenticated.audience === "browser" &&
        authorized.invocation.name === "memory.create_project"
      ) {
        const createdProjectId = resultProjectId(rpcResponse.result);
        if (createdProjectId) {
          admission.browserSessions.allowCreatedProject(authenticated, createdProjectId);
        }
      }
      admission.registrar.complete(authorized.invocation, rpcResponse);
      sendRpcResponse(response, rpcResponse);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        sendError(response, 413, "validation");
        return;
      }
      if (error instanceof SyntaxError || error instanceof InvalidRequestError) {
        sendError(response, 400, "validation");
        return;
      }
      sendError(response, 500, "internal");
    }
  });
  server.once("close", () => {
    if (typeof service.dispose === "function") service.dispose();
  });
  return server;
}

/** Trusted launcher hook. No HTTP endpoint issues bootstrap codes. */
export function issueBrowserBootstrap(
  admission: DaemonAdmissionServices,
  origin: string,
  host: string,
  grant: BrowserBootstrapGrant
) {
  return admission.browserSessions.issueBootstrap(origin, host, grant);
}

async function handleBrowserBootstrap(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  sessions: BrowserSessionService
): Promise<void> {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) {
    sendError(response, 403, "forbidden");
    return;
  }
  const body = parseObject(await readRequestBody(request));
  const issue = typeof body.code === "string"
    ? sessions.consumeBootstrap(body.code, origin, host)
    : undefined;
  if (!issue) {
    sendError(response, 401, "unauthorized");
    return;
  }
  response.statusCode = 200;
  response.setHeader("set-cookie", sessions.cookieHeader(issue));
  response.end(JSON.stringify(browserSessionResponse(issue)));
}

async function handleBrowserPreview(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  sessions: BrowserSessionService,
  service: MemoryService
): Promise<void> {
  requireEmptyObject(await readRequestBody(request));
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) {
    sendError(response, 403, "forbidden");
    return;
  }
  const issue = sessions.establishUnboundPreviewSession(
    origin,
    host,
    operationsForAudience("browser"),
    (await service.listProjects()).map((project) => project.id)
  );
  response.statusCode = 200;
  response.setHeader("set-cookie", sessions.cookieHeader(issue));
  response.end(JSON.stringify(browserSessionResponse(issue)));
}

async function handleBrowserRotate(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  sessions: BrowserSessionService,
  allowPersonalPreviewTokenFallback: boolean
): Promise<void> {
  requireEmptyObject(await readRequestBody(request));
  const cookie = browserCookie(request);
  const origin = request.headers.origin;
  const host = request.headers.host;
  const csrf = headerValue(request, "x-csrf-token");
  const issue = cookie && origin && host && csrf
    ? sessions.rotateSession(cookie, csrf, origin, host, allowPersonalPreviewTokenFallback)
    : undefined;
  if (!issue) {
    sendError(response, 401, "unauthorized");
    return;
  }
  response.statusCode = 200;
  response.setHeader("set-cookie", sessions.cookieHeader(issue));
  response.end(JSON.stringify(browserSessionResponse(issue)));
}

async function handleBrowserProject(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  sessions: BrowserSessionService,
  allowPersonalPreviewTokenFallback: boolean
): Promise<void> {
  const body = parseObject(await readRequestBody(request));
  const cookie = browserCookie(request);
  const origin = request.headers.origin;
  const host = request.headers.host;
  const csrf = headerValue(request, "x-csrf-token");
  const issue = cookie && origin && host && csrf && typeof body.projectId === "string"
    ? sessions.switchProject(cookie, csrf, origin, host, body.projectId, allowPersonalPreviewTokenFallback)
    : undefined;
  if (!issue) {
    sendError(response, 401, "unauthorized");
    return;
  }
  response.statusCode = 200;
  response.setHeader("set-cookie", sessions.cookieHeader(issue));
  response.end(JSON.stringify(browserSessionResponse(issue)));
}

async function handleBrowserRevoke(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  sessions: BrowserSessionService,
  allowPersonalPreviewTokenFallback: boolean
): Promise<void> {
  requireEmptyObject(await readRequestBody(request));
  const cookie = browserCookie(request);
  const origin = request.headers.origin;
  const host = request.headers.host;
  const csrf = headerValue(request, "x-csrf-token");
  const principal = sessions.authenticate(
    cookie,
    csrf,
    origin,
    host || "",
    true,
    allowPersonalPreviewTokenFallback
  );
  if (!principal) {
    sendError(response, 401, "unauthorized");
    return;
  }
  sessions.revokePrincipal(principal);
  response.statusCode = 204;
  response.setHeader("set-cookie", sessions.expiredCookieHeader(origin));
  response.end();
}

async function handleHardenedMcp(
  service: MemoryService,
  admission: DaemonAdmissionServices,
  request: http.IncomingMessage,
  response: http.ServerResponse,
  principal: AuthenticatedPrincipal<OperationName>,
  body: string
): Promise<void> {
  const payload = JSON.parse(body);
  const mcpResponse = await handleMcpJsonRpcPayload(payload, async (call, context) => {
    const decoded = decodeMemoryToolCall(call);
    const definition = getOperationDefinition(decoded.operation);
    const requiresMutationIdempotency =
      definition.effect !== "read" && definition.idempotency === "required";
    const idempotencyKey = requiresMutationIdempotency
      ? deriveMcpMutationIdempotencyKey(context.requestId, decoded.operation)
      : undefined;
    const rpcRequest = await bindAgentStartupRequest(service, principal, {
      version: RPC_COMPATIBILITY_VERSION,
      id: context.requestId,
      method: decoded.operation,
      params: decoded.input
    });
    const authorized = admission.registrar.authorize(
      await admissionContextForRpc(
        service,
        "/mcp",
        request,
        principal,
        rpcRequest,
        requiresMutationIdempotency ? { idempotencyKey } : undefined
      ),
      rpcRequest
    );
    if (!authorized.ok) throw new McpAdmissionError(authorized.error.code);
    const rpcResponse = await service.withDomainEffect(
      authorized.invocation.domainEffect,
      () => dispatchAuthorizedAgentRpc(service, authorized.invocation)
    );
    admission.registrar.complete(authorized.invocation, rpcResponse);
    if (!rpcResponse.ok) throw new McpAdmissionError(rpcResponse.error.code ?? "internal");
    return { content: [{ type: "text", text: JSON.stringify(rpcResponse.result, null, 2) }] };
  });
  if (!mcpResponse) {
    response.statusCode = 202;
    response.end("");
    return;
  }
  response.statusCode = 200;
  response.end(JSON.stringify(mcpResponse));
}

async function handlePersonalPreviewRequest(
  config: DaemonConfig,
  service: MemoryService,
  request: http.IncomingMessage,
  response: http.ServerResponse
): Promise<void> {
  if (!legacyAuthorized(config, request)) {
    sendError(response, 401, "unauthorized");
    return;
  }
  const body = await readRequestBody(request);
  if (request.url === "/mcp") {
    const payload = JSON.parse(body);
    const mcpResponse = await handleMcpJsonRpcPayload(payload, (call) => dispatchPreviewMcp(service, call));
    response.statusCode = mcpResponse ? 200 : 202;
    response.end(mcpResponse ? JSON.stringify(mcpResponse) : "");
    return;
  }
  const rpcRequest = parseRpcRequest(body);
  const rpcResponse = request.url === "/agent-rpc"
    ? await dispatchAgentRpc(service, rpcRequest)
    : await dispatchRpc(service, rpcRequest);
  if (rpcRequest.version === undefined) {
    sendLegacyPreviewRpcResponse(response, rpcResponse);
    return;
  }
  sendRpcResponse(response, rpcResponse);
}

async function dispatchPreviewMcp(service: MemoryService, call: McpToolCall): Promise<unknown> {
  const tool = MEMORY_TOOLS.find((candidate) => candidate.name === call.name);
  if (!tool) throw new Error("Unknown memory tool.");
  const rpcResponse = await dispatchAgentRpc(service, {
    id: 0,
    method: tool.rpcMethod,
    params: call.arguments || {}
  });
  if (!rpcResponse.ok) throw new Error("Agent request failed.");
  return { content: [{ type: "text", text: JSON.stringify(rpcResponse.result, null, 2) }] };
}

function authenticateHardenedRequest(
  admission: DaemonAdmissionServices,
  request: http.IncomingMessage,
  allowPersonalPreviewTokenFallback: boolean
): AuthenticatedPrincipal<OperationName> | undefined {
  if (request.url === "/rpc" && request.headers.origin) {
    return admission.browserSessions.authenticate(
      browserCookie(request),
      headerValue(request, "x-csrf-token"),
      request.headers.origin,
      request.headers.host || "",
      true,
      allowPersonalPreviewTokenFallback
    );
  }
  if (request.headers.origin) return undefined;
  return admission.authority.authenticate(bearerCredential(request));
}

function admissionContext(
  endpoint: AdmissionEndpoint,
  request: http.IncomingMessage,
  principal: AuthenticatedPrincipal<OperationName>,
  overrides?: {
    readonly idempotencyKey?: string;
    readonly projectGeneration?: string;
  }
) {
  const idempotencyKey = overrides?.idempotencyKey
    ?? headerValue(request, "x-idempotency-key");
  const correlationId = headerValue(request, "x-correlation-id");
  return {
    endpoint,
    httpMethod: request.method || "",
    host: request.headers.host || "",
    ...(request.headers.origin ? { origin: request.headers.origin } : {}),
    principal,
    csrfValidated: principal.audience !== "browser" || Boolean(headerValue(request, "x-csrf-token")),
    ...(idempotencyKey ? { idempotencyKey } : {}),
    ...(correlationId ? { correlationId } : {}),
    ...(overrides?.projectGeneration ? { projectGeneration: overrides.projectGeneration } : {})
  };
}

async function admissionContextForRpc(
  service: MemoryService,
  endpoint: AdmissionEndpoint,
  request: http.IncomingMessage,
  principal: AuthenticatedPrincipal<OperationName>,
  rpcRequest: RpcRequest,
  overrides?: { readonly idempotencyKey?: string }
) {
  let projectGeneration: string | undefined;
  if (isOperationName(rpcRequest.method)) {
    try {
      const decoded = parseOperationInput(rpcRequest.method, rpcRequest.params || {});
      const projectId = extractOperationProjectId(rpcRequest.method, decoded);
      if (projectId) projectGeneration = await service.getProjectGeneration(projectId);
    } catch {
      // The registrar owns the public validation result. Generation lookup is
      // performed only for an already decodable exact project input.
    }
  }
  return admissionContext(endpoint, request, principal, {
    ...(overrides?.idempotencyKey ? { idempotencyKey: overrides.idempotencyKey } : {}),
    ...(projectGeneration ? { projectGeneration } : {})
  });
}

/**
 * Startup is the sole agent operation whose compatibility input may omit a
 * project id. Bind it from authenticated claims only after any caller-supplied
 * working directory resolves back to that exact project. The registrar still
 * receives an ordinary exact-project request and remains strict for every
 * other operation.
 */
async function bindAgentStartupRequest(
  service: MemoryService,
  principal: AuthenticatedPrincipal<OperationName>,
  rpcRequest: RpcRequest
): Promise<RpcRequest> {
  if (
    principal.audience !== "agent" ||
    principal.projectId === null ||
    rpcRequest.version !== RPC_COMPATIBILITY_VERSION ||
    rpcRequest.method !== "memory.get_startup_state" ||
    !principal.operations.includes("memory.get_startup_state") ||
    extractOperationProjectId("memory.get_startup_state", rpcRequest.params ?? {}) !== undefined
  ) {
    return rpcRequest;
  }

  let input: Record<string, unknown>;
  try {
    input = parseOperationInput("memory.get_startup_state", rpcRequest.params ?? {});
  } catch {
    return rpcRequest;
  }
  const workingDirectory = input.workingDirectory;
  if (typeof workingDirectory === "string") {
    try {
      const detected = await service.detectProject({ workingDirectory });
      if (detected.projectId !== principal.projectId) return rpcRequest;
      input = { ...input, workingDirectory: detected.workingDirectory };
    } catch {
      return rpcRequest;
    }
  }
  return {
    ...rpcRequest,
    params: { ...input, projectId: principal.projectId }
  };
}

function parseRpcRequest(body: string): RpcRequest {
  return parseObject(body) as unknown as RpcRequest;
}

function legacyAuthorized(config: DaemonConfig, request: http.IncomingMessage): boolean {
  if (config.authMode === "none") return true;
  const presented = bearerCredential(request);
  if (!config.authToken || !presented) return false;
  const expected = Buffer.from(config.authToken, "utf8");
  const actual = Buffer.from(presented, "utf8");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function bearerCredential(request: http.IncomingMessage): string | undefined {
  const authorization = request.headers.authorization;
  const match = typeof authorization === "string" ? /^Bearer ([^\s]+)$/i.exec(authorization) : null;
  return match?.[1];
}

function browserCookie(request: http.IncomingMessage): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === BROWSER_SESSION_COOKIE) return rest.join("=");
  }
  return undefined;
}

function headerValue(request: http.IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

function hasLoopbackHostHeader(request: http.IncomingMessage): boolean {
  const host = request.headers.host;
  if (!host) return false;
  try {
    return isLoopbackHost(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function setCorsHeaders(request: http.IncomingMessage, response: http.ServerResponse): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  if (!isLocalOrigin(origin)) return false;
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-methods", "GET,HEAD,POST,OPTIONS");
  response.setHeader(
    "access-control-allow-headers",
    "content-type,x-correlation-id,x-rpc-compatibility-version,x-idempotency-key,if-match,x-csrf-token"
  );
  response.setHeader("access-control-allow-credentials", "true");
  response.setHeader("access-control-max-age", "600");
  response.setHeader("vary", "Origin");
  return true;
}

function isLocalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.origin === origin && isLoopbackHost(url.hostname);
  } catch {
    return false;
  }
}

function sendRpcResponse(response: http.ServerResponse, rpcResponse: RpcResponse): void {
  response.statusCode = rpcResponse.ok ? 200 : 400;
  response.end(JSON.stringify(rpcResponse));
}

function sendLegacyPreviewRpcResponse(
  response: http.ServerResponse,
  rpcResponse: RpcResponse
): void {
  response.statusCode = rpcResponse.ok ? 200 : 400;
  response.end(JSON.stringify(rpcResponse.ok
    ? { id: rpcResponse.id, ok: true, result: rpcResponse.result }
    : {
        id: rpcResponse.id,
        ok: false,
        error: { message: legacyPublicMessage(rpcResponse.error.messageId) }
      }));
}

function legacyPublicMessage(messageId: string): string {
  switch (messageId) {
    case "operation.validation": return "The request is not valid.";
    case "operation.unauthorized": return "Unlock this session to continue.";
    case "operation.forbidden": return "This action is not allowed.";
    case "operation.not_found": return "The requested item was not found.";
    case "operation.conflict": return "The item changed before this action completed.";
    case "operation.unavailable": return "The memory service is unavailable.";
    case "operation.timeout": return "The memory service did not respond in time.";
    case "operation.cancelled": return "The operation was cancelled.";
    case "operation.protocol": return "The memory service returned an invalid response.";
    case "operation.compatibility": return "The memory service is not compatible with this app version.";
    case "operation.outcome_unknown": return "The operation may have been applied; reconcile before trying again.";
    default: return "The operation could not be completed.";
  }
}

function sendError(
  response: http.ServerResponse,
  status: number,
  code: Parameters<typeof createPublicError>[0],
  id?: string | number
): void {
  response.statusCode = status;
  response.end(JSON.stringify(rpcError(id, createPublicError(code))));
}

class BodyTooLargeError extends Error {}
class InvalidRequestError extends Error {}
class McpAdmissionError extends Error {
  constructor(readonly publicCode: string) {
    super("MCP operation refused.");
  }
}

function readRequestBody(request: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    let settled = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BODY_BYTES) {
        settled = true;
        reject(new BodyTooLargeError());
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!settled) resolve(body || "{}");
    });
    request.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function parseObject(body: string): Record<string, unknown> {
  const value = JSON.parse(body) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidRequestError();
  }
  return value as Record<string, unknown>;
}

function requireEmptyObject(body: string): void {
  if (Object.keys(parseObject(body)).length !== 0) throw new InvalidRequestError();
}

function browserSessionResponse(issue: {
  readonly csrfToken: string;
  readonly expiresAt: string;
  readonly rotationId: string;
  readonly principal: { readonly projectId: string | null };
}) {
  return {
    csrfToken: issue.csrfToken,
    expiresAt: issue.expiresAt,
    rotationId: issue.rotationId,
    projectId: issue.principal.projectId
  };
}

function resultProjectId(result: unknown): string | undefined {
  if (!result || typeof result !== "object" || Array.isArray(result)) return undefined;
  const projectId = (result as Record<string, unknown>).id;
  return typeof projectId === "string" && projectId.length > 0 ? projectId : undefined;
}

function assertSecureDaemonConfig(config: DaemonConfig): void {
  if (config.authMode === "none" && !isLoopbackHost(config.host)) {
    throw new Error("Unauthenticated preview must bind to an exact loopback host.");
  }
  if (
    config.profile === "hardened-local" &&
    (config.authMode !== "token" || !isLoopbackHost(config.host))
  ) {
    throw new Error("Hardened-local requires token/session authentication on an exact loopback host.");
  }
}

function isDependencies(value: MemoryService | DaemonServerDependencies): value is DaemonServerDependencies {
  return "service" in value || "admission" in value;
}

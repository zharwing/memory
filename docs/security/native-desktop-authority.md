# Native desktop authority

## Security boundary

The webview is untrusted application content. It never receives a daemon,
administrator, browser-session, provider, or backup credential. The Rust host
owns the desktop principal, the daemon process it launches, and the only HTTP
authorization header used for desktop RPC.

The packaged application selects the Tauri composition root. Browser builds
select the cookie-and-CSRF browser root. Those roots are mutually exclusive;
there is no browser fallback from a failed native invocation.

## Startup and project binding

1. The Rust host accepts only an exact loopback daemon address.
2. It refuses to attach to a daemon process it did not launch.
3. It launches the daemon in `hardened-local` token mode with a fresh,
   one-shot credential-exchange path.
   Packaged builds run the sidecar from a writable OS user-data directory and,
   unless the operator supplied an absolute memory root, set the existing
   `AI Memory Root` folder beneath that directory. They never depend on the
   build machine's source checkout or default private data beneath installation
   resources.
4. The daemon creates a 256-bit desktop credential, registers it for the
   `desktop` audience and the exact project, writes it once, and removes the
   exchange setting from its own process environment.
5. Rust reads a bounded regular file, removes it immediately, and retains the
   credential only in native memory. Restart, project change, or shutdown
   terminates the owned daemon and zeroes the old credential buffer.

A project change therefore rotates both the daemon process and desktop
principal. A null-bound startup principal can perform only registry operations
whose desktop project scope is explicitly `none`; it cannot perform a scoped
read or effect.

## Invoke surface

`memory_rpc` is the only custom command. Tauri v2 registers it at build time
and grants it only to the main application window through the explicit
capability and permission files. The command accepts a bounded serialized RPC
request and a separately typed project identifier. Rust validates the project
identifier, establishes the matching native authority, and sends the request
to the exact loopback daemon with bounded request and response sizes.

The Tauri configuration keeps a restrictive CSP. Shell execution is not
registered or reachable from source. Native folder selection remains an
explicit dialog capability; selected paths are still treated as untrusted and
must be canonicalized and policy-checked by the daemon before use.

## Failure and recovery

The host fails closed when the daemon is already running but is not owned by
the current process, the credential exchange is not a bounded regular file,
the daemon is not hardened, the project binding is invalid, or the response is
not a bounded JSON object. Product UI must render a locked/recovery state; it
must not ask the webview for a bearer token or silently switch to browser RPC.

## Verification obligations

- Tauri manifest, generated command permission, capability, and CSP agree on
  the one-command surface.
- Browser content cannot import or observe the native credential.
- A credential for project A is refused for project B and after rotation.
- A hostile/oversized invoke payload and malformed daemon response fail closed.
- Packaged runtime selection proves Tauri uses native composition and ordinary
  browser builds use browser composition.

Packaged verification is a final qualification gate. Lack of the packaging
environment does not justify weakening the source boundary.

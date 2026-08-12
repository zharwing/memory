# Frontend performance budgets

Budgets are source-controlled and intentionally deterministic:

| Metric | Budget |
| --- | ---: |
| startup module | 450,000 bytes |
| largest JavaScript chunk | 1,200,000 bytes |
| all JavaScript | 4,500,000 bytes |
| all CSS | 500,000 bytes |
| emitted files | 256 |
| provider response | 4 MiB |
| native RPC request/response | 8 MiB |

The editor, Mermaid, and graph engines remain lazy feature chunks. The startup
route must not eagerly import them. A budget increase requires an ADR with a
measured critical-path reason, an owner, an expiry/revisit date, and before/after
evidence; changing an environment variable is not an approved waiver.

Performance scenarios cover cold first paint, project A-to-B switching, 200-row
session pagination, graph pan/zoom under the configured node/edge budget,
semantic polling backoff, dialog/open-close focus, and recovery after a lost
request. Each scenario records profile, dataset cardinality, browser/WebView,
machine class, warm/cold state, and p50/p95 observations. A desktop result is
not substituted for a browser result or vice versa.

## Controlled observation contract

Performance input is evidence, not a tuning switch. It uses
`zharwing.frontend-performance.v1` and contains only the seven allowlisted
scenario names, `browser` or `webview` surface, bounded synthetic dataset and
machine-class labels, browser/WebView version, warm-state label, sample count,
and finite p50/p95 milliseconds. Paths, project names, raw traces, URLs,
credentials, provider responses, and arbitrary metadata are rejected.

The input belongs under:

```text
EXECUTION/evidence/frontend-v2/MEM-FEV2-10/performance-input/
```

Example using fictional data:

```json
{
  "schema": "zharwing.frontend-performance.v1",
  "scenarios": [
    {
      "name": "project-switch",
      "surface": "browser",
      "dataset": "synthetic-20-projects",
      "machineClass": "qualification-windows-medium",
      "browserVersion": "Edge <qualified-version>",
      "warmState": "warm-daemon-cold-route",
      "samples": 20,
      "p50Ms": 84,
      "p95Ms": 141
    }
  ]
}
```

The example is one row only. A submitted observation file must cover all seven
allowlisted scenario names; otherwise the generator refuses to label it
observed.

The evidence generator validates and hashes this file. If it is absent,
controlled performance remains `deferred_platform_validation`; it is never
represented by build duration or an unrelated browser smoke.

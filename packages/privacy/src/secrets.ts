import type { Redaction } from "@zharwing/memory-core";

export interface SecretFinding {
  kind: Redaction["kind"];
  severity: Redaction["severity"];
  match: string;
  replacement: string;
}

const SECRET_PATTERNS: Array<{
  kind: Redaction["kind"];
  severity: Redaction["severity"];
  pattern: RegExp;
  replacement: string;
}> = [
  {
    kind: "key",
    severity: "high",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]"
  },
  {
    kind: "token",
    severity: "high",
    pattern: /\b(?:sk|pk|rk|ghp|gho|github_pat)_[A-Za-z0-9_\-]{20,}\b/g,
    replacement: "[REDACTED_TOKEN]"
  },
  {
    kind: "credential",
    severity: "high",
    pattern: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[:=]\s*["']?[^"'\s]{8,}/gi,
    replacement: "[REDACTED_CREDENTIAL]"
  },
  {
    kind: "credential",
    severity: "medium",
    pattern: /\b[A-Za-z0-9._%+-]+:[A-Za-z0-9._%+-]{8,}@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: "[REDACTED_BASIC_AUTH_URL]"
  },
  {
    kind: "secret",
    severity: "medium",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
    replacement: "[REDACTED_AWS_ACCESS_KEY]"
  }
];

export function scanSecrets(content: string): SecretFinding[] {
  const findings: SecretFinding[] = [];

  for (const definition of SECRET_PATTERNS) {
    const matches = content.matchAll(definition.pattern);
    for (const match of matches) {
      if (!match[0]) continue;
      findings.push({
        kind: definition.kind,
        severity: definition.severity,
        match: match[0],
        replacement: definition.replacement
      });
    }
  }

  return findings;
}

export function redactSecrets(content: string): { content: string; redactions: Omit<Redaction, "itemId">[] } {
  let next = content;
  const grouped = new Map<string, Omit<Redaction, "itemId">>();

  for (const finding of scanSecrets(content)) {
    next = next.split(finding.match).join(finding.replacement);
    const key = `${finding.kind}:${finding.replacement}:${finding.severity}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      kind: finding.kind,
      replacement: finding.replacement,
      severity: finding.severity,
      count: (existing?.count || 0) + 1
    });
  }

  return { content: next, redactions: [...grouped.values()] };
}

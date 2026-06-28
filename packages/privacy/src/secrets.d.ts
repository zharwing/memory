import type { Redaction } from "@aimem/core";
export interface SecretFinding {
    kind: Redaction["kind"];
    severity: Redaction["severity"];
    match: string;
    replacement: string;
}
export declare function scanSecrets(content: string): SecretFinding[];
export declare function redactSecrets(content: string): {
    content: string;
    redactions: Omit<Redaction, "itemId">[];
};

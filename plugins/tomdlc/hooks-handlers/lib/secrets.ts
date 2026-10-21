// High-confidence credential patterns, shared by the secrets guard (which
// blocks writes) and the prompt audit (which redacts before logging).
// Deliberately narrow to avoid false positives; CI secret scanning remains
// the thorough check.

export const SECRET_PATTERNS: [string, RegExp][] = [
  ["AWS access key ID", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["private key block", /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["Stripe live secret key", /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/],
  ["credentials in connection URL", /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:[^\s@/]{6,}@[^\s]+/i],
]

/** Placeholder values that look like secrets but are not. */
export const SECRET_ALLOW = /EXAMPLE|example|xxxx|XXXX|<[^>]+>|\$\{[^}]+\}|changeme|placeholder|dummy|redacted/

/** Labels of the secret types found in the text. */
export function findSecrets(text: string): string[] {
  const hits = new Set<string>()
  for (const [label, re] of SECRET_PATTERNS) {
    const m = text.match(re)
    if (m && !SECRET_ALLOW.test(m[0])) hits.add(label)
  }
  return [...hits]
}

/** The text with every secret match replaced by a marker. A private key block also loses what follows it. */
export function redactSecrets(text: string): string {
  let out = text
  for (const [label, re] of SECRET_PATTERNS) {
    const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")
    out = out.replace(global, (m) => (SECRET_ALLOW.test(m) ? m : `[REDACTED ${label}]`))
  }
  return out.replace(/\[REDACTED private key block\][\s\S]*?(-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g, "[REDACTED private key block]")
}

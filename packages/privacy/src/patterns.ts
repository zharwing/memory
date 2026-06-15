export function matchesAnyPattern(filePath: string | undefined, patterns: string[]): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, "/");
  return patterns.some((pattern) => matchPattern(normalized, pattern));
}

export function matchPattern(filePath: string, pattern: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, "/");

  if (normalizedPattern.endsWith("/")) {
    return filePath.includes(`/${normalizedPattern}`) || filePath.endsWith(normalizedPattern.slice(0, -1));
  }

  if (normalizedPattern.startsWith("**/")) {
    return filePath.endsWith(normalizedPattern.slice(3));
  }

  if (normalizedPattern.includes("**")) {
    const regex = globToRegex(normalizedPattern);
    return regex.test(filePath);
  }

  if (normalizedPattern.includes("*")) {
    const regex = globToRegex(normalizedPattern);
    return regex.test(filePath.split("/").pop() || filePath);
  }

  return filePath === normalizedPattern || filePath.endsWith(`/${normalizedPattern}`);
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

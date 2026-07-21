export function parseSvixSignatures(header: string): string[] {
  return header
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("v1,"))
    .map((entry) => entry.slice(3))
    .filter(Boolean);
}

// Sanitize the source text for use as a filename segment.
// Replace whitespace with underscores, then drop anything not in [A-Za-z0-9_-].
function sanitizeText(text: string): string {
  return text.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_-]/g, "");
}

// Format a Date as YYYY-MM-DDTHH-MM-SS in the browser's local timezone.
// Colons are replaced with dashes for filesystem safety; no fractional
// seconds, no `Z` suffix, no offset — local-machine-only readability.
function localIsoFilename(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`
  );
}

// Build the download filename for the export zip. Format:
//   lightbox-<sanitizedText>-<localIso>.zip
// If the sanitized text is empty, the text segment (and its leading dash)
// is omitted.
export function buildZipFilename(text: string, date: Date): string {
  const t = sanitizeText(text);
  const iso = localIsoFilename(date);
  return t.length > 0 ? `lightbox-${t}-${iso}.zip` : `lightbox-${iso}.zip`;
}

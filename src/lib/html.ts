/**
 * Small HTML-safety helpers. This is a static, server-rendered data site with no
 * user-supplied input, but these guard the two `dangerouslySetInnerHTML` patterns
 * (JSON-LD <script> blocks and D3 tooltip strings) as defense in depth, so a stray
 * `<`, `&`, or `</script>` in any displayed dataset label can never break out.
 */

/** Serialize an object for a JSON-LD <script>, neutralizing `</script>` / `<!--` breakout. */
export function jsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape text for safe interpolation into an HTML string (e.g. tooltip markup). */
export function escapeHtml(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}

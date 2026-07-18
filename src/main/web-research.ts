/**
 * A deliberately small, opt-in web-search helper for the Electron main process.
 *
 * Calling `searchWeb` sends the supplied query to DuckDuckGo. It never fetches
 * result pages, so returned URLs are citations only and cannot cause background
 * requests to arbitrary hosts.
 */
export type WebSource = {
  title: string;
  url: string;
  snippet: string;
  citation: string;
};

const SEARCH_ENDPOINT = "https://html.duckduckgo.com/html/";
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const MAX_QUERY_LENGTH = 300;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 1_500_000;
const MAX_TITLE_LENGTH = 300;
const MAX_SNIPPET_LENGTH = 800;

const namedEntities: Readonly<Record<string, string>> = {
  amp: "&",
  apos: "'",
  nbsp: " ",
  quot: "\"",
  lt: "<",
  gt: ">",
  ndash: "\u2013",
  mdash: "\u2014",
  hellip: "\u2026"
};

/**
 * Search DuckDuckGo's public HTML endpoint and return a bounded set of
 * validated citations. This makes one external request per invocation.
 */
export async function searchWeb(query: string, limit = DEFAULT_LIMIT): Promise<WebSource[]> {
  const safeQuery = validateQuery(query);
  const safeLimit = validateLimit(limit);
  const endpoint = new URL(SEARCH_ENDPOINT);
  endpoint.searchParams.set("q", safeQuery);

  const response = await fetch(endpoint, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Cenro local research helper/0.1"
    },
    redirect: "error",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (!response.ok) {
    throw new Error(`Web search returned HTTP ${response.status}.`);
  }

  const html = await readTextWithCap(response);
  return parseSearchResults(html, safeLimit).map((source, index) => ({
    ...source,
    citation: `[${index + 1}] ${source.title} (${source.url})`
  }));
}

function validateQuery(query: string): string {
  if (typeof query !== "string") {
    throw new TypeError("A web-search query must be a string.");
  }

  const normalized = query.replace(/\s+/g, " ").trim();
  if (!normalized) {
    throw new Error("A web-search query cannot be empty.");
  }
  if (normalized.length > MAX_QUERY_LENGTH) {
    throw new RangeError(`A web-search query must be at most ${MAX_QUERY_LENGTH} characters.`);
  }
  if (/[\u0000-\u001F\u007F]/.test(normalized)) {
    throw new Error("A web-search query contains unsupported control characters.");
  }

  return normalized;
}

function validateLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("The web-search limit must be a positive integer.");
  }

  return Math.min(limit, MAX_LIMIT);
}

async function readTextWithCap(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error("Web search response exceeded the allowed size.");
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Web search response exceeded the allowed size.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function parseSearchResults(html: string, limit: number): Array<Omit<WebSource, "citation">> {
  const sources: Array<Omit<WebSource, "citation">> = [];
  const seenUrls = new Set<string>();
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while (sources.length < limit && (match = anchorPattern.exec(html))) {
    const attributes = match[1];
    const className = readAttribute(attributes, "class") ?? "";
    if (!hasAnyClass(className, ["result__a", "result-link"])) continue;

    const url = normalizeResultUrl(readAttribute(attributes, "href"));
    if (!url || seenUrls.has(url)) continue;

    const title = trimText(htmlToText(match[2]), MAX_TITLE_LENGTH);
    if (!title) continue;

    const nearbyHtml = html.slice(anchorPattern.lastIndex, nextResultBoundary(html, anchorPattern.lastIndex));
    const snippet = trimText(extractSnippet(nearbyHtml), MAX_SNIPPET_LENGTH);
    seenUrls.add(url);
    sources.push({ title, url, snippet });
  }

  return sources;
}

function nextResultBoundary(html: string, start: number): number {
  const remainder = html.slice(start, start + 12_000);
  const anchors = /<a\b([^>]*)>/gi;
  let anchor: RegExpExecArray | null;
  while ((anchor = anchors.exec(remainder))) {
    if (hasAnyClass(readAttribute(anchor[1], "class") ?? "", ["result__a", "result-link"])) {
      return start + anchor.index;
    }
  }
  return start + remainder.length;
}

function extractSnippet(html: string): string {
  const elements = /<(a|div|span|td|p)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  let element: RegExpExecArray | null;
  while ((element = elements.exec(html))) {
    if (hasAnyClass(readAttribute(element[2], "class") ?? "", ["result__snippet", "result-snippet"])) {
      return htmlToText(element[3]);
    }
  }
  return "";
}

function readAttribute(attributes: string, name: "class" | "href"): string | undefined {
  const pattern = "\\b" + name + "\\s*=\\s*(?:\\\"([^\\\"]*)\\\"|'([^']*)'|([^\\s\\\"'=<>`]+))";
  const match = new RegExp(pattern, "i").exec(attributes);
  return match ? decodeHtml(match[1] ?? match[2] ?? match[3] ?? "") : undefined;
}

function hasAnyClass(className: string, expectedClasses: readonly string[]): boolean {
  const classes = new Set(className.toLowerCase().split(/\s+/).filter(Boolean));
  return expectedClasses.some((expected) => classes.has(expected));
}

function normalizeResultUrl(rawHref: string | undefined): string | undefined {
  if (!rawHref) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(rawHref.trim(), SEARCH_ENDPOINT);
  } catch {
    return undefined;
  }

  const isDuckDuckGo = parsed.hostname === "duckduckgo.com" || parsed.hostname.endsWith(".duckduckgo.com");
  if (isDuckDuckGo) {
    const destination = parsed.searchParams.get("uddg");
    return destination ? normalizeDestination(destination) : undefined;
  }

  return normalizeDestination(parsed.href);
}

function normalizeDestination(rawUrl: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return undefined;
  }

  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname || parsed.username || parsed.password) {
    return undefined;
  }

  // Fragments are not useful citations and would make equivalent results look distinct.
  parsed.hash = "";
  return parsed.href;
}

function htmlToText(value: string): string {
  return decodeHtml(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function decodeHtml(value: string): string {
  const decodedNumeric = value.replace(/&#(x[0-9a-f]+|\d+);?/gi, (entity, encoded: string) => {
    const codePoint = encoded[0].toLowerCase() === "x" ? Number.parseInt(encoded.slice(1), 16) : Number.parseInt(encoded, 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return entity;
    }
  });

  return decodedNumeric.replace(/&([a-z][a-z0-9]+);/gi, (entity, name: string) => namedEntities[name.toLowerCase()] ?? entity);
}

function trimText(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  return `${value.slice(0, maximumLength - 1).trimEnd()}\u2026`;
}

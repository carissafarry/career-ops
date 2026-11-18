import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
import * as yaml from "js-yaml";

/**
 * A configuration error that lets the route distinguish a broken user-layer
 * file (409: the user must repair it) from an installation/read failure (500).
 */
export class PortalsConfigError extends Error {
  /**
   * @param {string} message
   * @param {"invalid-user-config" | "read-failed" | "invalid-template"} kind
   * @param {unknown} [cause]
   */
  constructor(message, kind, cause) {
    super(message, { cause });
    this.name = "PortalsConfigError";
    this.kind = kind;
  }
}

/** @param {unknown} value */
export function isMapping(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Load portals.yml without treating parse/read failures as a missing file.
 * The shipped template is used only when the user-layer file is absent.
 *
 * @param {string} file
 * @param {string} templateFile
 * @returns {{ doc: Record<string, unknown>, seeded: boolean, source: string }}
 */
export function loadPortalsDocument(file, templateFile) {
  let source;
  let seeded = false;

  try {
    source = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (!error || typeof error !== "object" || error.code !== "ENOENT") {
      throw new PortalsConfigError("could not read portals.yml", "read-failed", error);
    }

    seeded = true;
    try {
      source = fs.readFileSync(templateFile, "utf8");
    } catch (templateError) {
      throw new PortalsConfigError("could not read portals template", "read-failed", templateError);
    }
  }

  let parsed;
  try {
    parsed = yaml.load(source);
  } catch (error) {
    throw new PortalsConfigError(
      seeded ? "portals template contains invalid YAML" : "portals.yml contains invalid YAML",
      seeded ? "invalid-template" : "invalid-user-config",
      error,
    );
  }

  if (!isMapping(parsed)) {
    throw new PortalsConfigError(
      seeded ? "portals template must contain a YAML mapping" : "portals.yml must contain a YAML mapping",
      seeded ? "invalid-template" : "invalid-user-config",
    );
  }

  return { doc: parsed, seeded, source };
}

/**
 * Return a merge-safe document that changes only the filters owned by the web
 * onboarding flow. All scanner sources and user customizations are preserved.
 *
 * @param {Record<string, unknown>} doc
 * @param {string[]} roles
 * @param {string[] | undefined} locations
 */
export function mergePortalFilters(doc, roles, locations) {
  const merged = { ...doc };
  const titleFilter = isMapping(doc.title_filter) ? { ...doc.title_filter } : {};
  titleFilter.positive = [...roles];
  merged.title_filter = titleFilter;

  if (locations?.length) {
    const locationFilter = isMapping(doc.location_filter) ? { ...doc.location_filter } : {};
    locationFilter.allow = [...locations];
    merged.location_filter = locationFilter;
  }

  return merged;
}

const isTopLevelKey = (line) => /^[^\s#-]/.test(line);
const isNote = (line) => line.trim() === "" || line.trim().startsWith("#");
const indentOf = (line) => line.length - line.trimStart().length;

/**
 * Replace (or add) one list, `section.key`, in portals.yml text, line by line,
 * so every other line, comments included, stays byte-for-byte. Returns null
 * for a shape this edit does not handle (a flow-style section, a scalar
 * value), so the caller can fall back.
 *
 * @param {string[]} lines - edited in place.
 * @param {string} section
 * @param {string} key
 * @param {string[]} items
 * @returns {string[] | null}
 */
function setListInText(lines, section, key, items) {
  const head = lines.findIndex((l) => new RegExp(`^${section}:\\s*(#.*)?$`).test(l));
  if (head < 0) {
    if (lines.some((l) => l.startsWith(`${section}:`))) return null; // flow style or a value on the same line
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push(`${section}:`, `  ${key}:`, ...items.map((i) => `    - ${JSON.stringify(i)}`), "");
    return lines;
  }
  let end = head + 1;
  while (end < lines.length && !isTopLevelKey(lines[end])) end++;
  const child = lines.slice(head + 1, end).find((l) => !isNote(l));
  const childIndent = child ? " ".repeat(indentOf(child)) : "  ";
  const at = lines.findIndex((l, i) => i > head && i < end && l.startsWith(`${childIndent}${key}:`));
  if (at < 0) {
    lines.splice(head + 1, 0, `${childIndent}${key}:`, ...items.map((i) => `${childIndent}  - ${JSON.stringify(i)}`));
    return lines;
  }
  const value = lines[at].slice(childIndent.length + key.length + 1).replace(/\s+#.*$/, "").trim();
  if (value !== "" && !/^\[.*\]$/.test(value)) return null;
  // The list's own lines: everything more indented than the key, up to its last
  // item. Notes between items stay (ahead of the new items, as onboard-write.mjs
  // keeps them); notes after the last item are left where they are.
  let last = at;
  for (let i = at + 1; i < end; i++) {
    if (isNote(lines[i])) continue;
    const sameIndentItem = indentOf(lines[i]) === childIndent.length && lines[i].trimStart().startsWith("- ");
    if (indentOf(lines[i]) <= childIndent.length && !sameIndentItem) break;
    last = i;
  }
  const body = lines.slice(at + 1, last + 1);
  const firstItem = body.find((l) => !isNote(l));
  const itemIndent = firstItem ? " ".repeat(indentOf(firstItem)) : `${childIndent}  `;
  lines.splice(at, last - at + 1, `${childIndent}${key}:`, ...body.filter(isNote), ...items.map((i) => `${itemIndent}- ${JSON.stringify(i)}`));
  return lines;
}

/**
 * portals.yml text with the web-owned filters replaced, keeping every comment
 * and every commented-out company block. A round-trip through yaml.dump would
 * drop all of them (fix-slugs.mjs edits this file as text for the same reason).
 * The result must parse to exactly `mergePortalFilters(doc, ...)`; when it does
 * not, or the file uses a shape the line edit does not handle, this returns
 * null and the caller falls back to serializing the merged document.
 *
 * @param {string} source - the text loadPortalsDocument parsed.
 * @param {string[]} roles
 * @param {string[] | undefined} locations
 * @returns {string | null}
 */
export function patchPortalFiltersText(source, roles, locations) {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  let lines = source.split(/\r?\n/);
  lines = setListInText(lines, "title_filter", "positive", roles);
  if (lines && locations?.length) lines = setListInText(lines, "location_filter", "allow", locations);
  if (!lines) return null;
  const text = lines.join(eol);
  try {
    const expected = mergePortalFilters(/** @type {Record<string, unknown>} */ (yaml.load(source)), roles, locations);
    return isDeepStrictEqual(yaml.load(text), expected) ? text : null;
  } catch {
    return null;
  }
}

export const CONTENT_KEYS = ["positive", "negative"];

/** An entry as a person reads it: the `word:` / `stem:` prefix is how it matches, not what it is. */
export function splitContentEntry(entry) {
  const m = /^(word|stem):(.*)$/i.exec(String(entry).trim());
  return m ? { mode: m[1].toLowerCase(), text: m[2].trim() } : { mode: "", text: String(entry).trim() };
}

const sameEntry = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/** The string a list item line holds (`- "word:crm"  # note`), or null for any other shape. */
function itemValue(line) {
  if (!line.trimStart().startsWith("- ")) return null;
  try {
    const parsed = yaml.load(line.trim());
    return Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === "string" ? parsed[0] : null;
  } catch {
    return null;
  }
}

/**
 * portals.yml text with entries added to, and removed from, `content_filter.<key>`
 * (the lists that read a posting's description). Line by line, so every comment,
 * every other list and every commented-out company stays byte-for-byte; new entries
 * go after the list's last item and removed ones lose only their own line. Returns
 * null for a shape this edit does not handle (flow style, a scalar), or when the
 * result would not parse to exactly the intended change, so the caller refuses
 * instead of rewriting the file.
 *
 * @param {string} source
 * @param {"positive" | "negative"} key
 * @param {{ add?: string[], remove?: string[] }} change
 * @returns {string | null}
 */
export function editContentFilterText(source, key, { add = [], remove = [] } = {}) {
  if (!CONTENT_KEYS.includes(key)) return null;
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const head = lines.findIndex((l) => /^content_filter:\s*(#.*)?$/.test(l));
  if (head < 0 && lines.some((l) => l.startsWith("content_filter:"))) return null;

  let doc;
  try {
    doc = yaml.load(source);
  } catch {
    return null;
  }
  if (!isMapping(doc)) return null;
  const section = isMapping(doc.content_filter) ? doc.content_filter : {};
  const current = Array.isArray(section[key]) ? section[key] : [];
  if (section[key] !== undefined && !Array.isArray(section[key])) return null;
  const toAdd = add.filter((e, i) => !current.some((c) => sameEntry(c, e)) && add.findIndex((x) => sameEntry(x, e)) === i);
  const expectedList = [...current.filter((c) => !remove.some((r) => sameEntry(c, r))), ...toAdd];

  if (head < 0) {
    if (toAdd.length === 0) return source;
    while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
    lines.push("content_filter:", `  ${key}:`, ...toAdd.map((e) => `    - ${JSON.stringify(e)}`), "");
  } else {
    let end = head + 1;
    while (end < lines.length && !isTopLevelKey(lines[end])) end++;
    const child = lines.slice(head + 1, end).find((l) => !isNote(l));
    const childIndent = child ? " ".repeat(indentOf(child)) : "  ";
    const at = lines.findIndex((l, i) => i > head && i < end && l.startsWith(`${childIndent}${key}:`));
    if (at < 0) {
      if (toAdd.length) lines.splice(head + 1, 0, `${childIndent}${key}:`, ...toAdd.map((e) => `${childIndent}  - ${JSON.stringify(e)}`));
    } else {
      const value = lines[at].slice(childIndent.length + key.length + 1).replace(/\s+#.*$/, "").trim();
      if (value !== "") return null; // flow style: `key: [a, b]`
      let last = at;
      const itemLines = [];
      for (let i = at + 1; i < end; i++) {
        if (isNote(lines[i])) continue;
        const sameIndentItem = indentOf(lines[i]) === childIndent.length && lines[i].trimStart().startsWith("- ");
        if (indentOf(lines[i]) <= childIndent.length && !sameIndentItem) break;
        last = i;
        itemLines.push(i);
      }
      const itemIndent = itemLines.length ? " ".repeat(indentOf(lines[itemLines[0]])) : `${childIndent}  `;
      const drop = new Set(itemLines.filter((i) => {
        const v = itemValue(lines[i]);
        return v !== null && remove.some((r) => sameEntry(v, r));
      }));
      const kept = lines.slice(at + 1, last + 1).filter((_, i) => !drop.has(at + 1 + i));
      lines.splice(at + 1, last - at, ...kept, ...toAdd.map((e) => `${itemIndent}- ${JSON.stringify(e)}`));
    }
  }

  const text = lines.join(eol);
  try {
    const result = yaml.load(text);
    // A list emptied of its last item stays as a bare `key:`, which reads back as null.
    if (isMapping(result?.content_filter) && result.content_filter[key] === null) result.content_filter[key] = [];
    const expected = { ...doc, content_filter: { ...section, [key]: expectedList } };
    if (expectedList.length === 0 && section[key] === undefined) delete expected.content_filter[key];
    return isDeepStrictEqual(result, expected) ? text : null;
  } catch {
    return null;
  }
}

/**
 * @typedef {{ name: string, enabled: boolean, host: string }} WatchedCompany
 */

/**
 * The companies in tracked_companies, scanned ones first, so the Portals page
 * can list them before any health check runs.
 *
 * @param {Record<string, unknown>} doc
 * @returns {WatchedCompany[]}
 */
export function watchedCompanies(doc) {
  const list = Array.isArray(doc.tracked_companies) ? doc.tracked_companies : [];
  const hostOf = (url) => {
    try {
      return new URL(String(url)).host;
    } catch {
      return "";
    }
  };
  return list
    .filter((c) => isMapping(c) && typeof c.name === "string" && c.name.trim())
    .map((c) => ({ name: c.name.trim(), enabled: c.enabled !== false, host: hostOf(c.careers_url ?? c.api) }))
    .sort((a, b) => Number(b.enabled) - Number(a.enabled));
}

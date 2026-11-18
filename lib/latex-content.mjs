/**
 * Content-level extract/patch for user-owned LaTeX CV templates.
 * Families: resumeSubheading | tabularx-itemize | position
 */

import { escapeLatex } from './latex-escape.mjs';

export const SUPPORTED_FAMILIES = ['resumeSubheading', 'tabularx-itemize', 'position'];

export const UNSUPPORTED_HINT =
  'Unsupported LaTeX CV layout. v1 supports \\resumeSubheading + \\resumeItem macros, ' +
  'tabularx + itemize without resume macros, or \\begin{position} blocks with \\item bullets (resume.cls style). ' +
  'Use /career-ops latex (cv.md → career-ops template) instead.';

/**
 * @param {string} tex
 * @returns {number}
 */
export function findMatchingBrace(tex, openIdx) {
  if (tex[openIdx] !== '{') return -1;
  let depth = 0;
  let escaped = false;
  for (let i = openIdx; i < tex.length; i++) {
    const ch = tex[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * @param {string} tex
 * @returns {'resumeSubheading'|'tabularx-itemize'|'position'|null}
 */
export function detectFamily(tex) {
  if (typeof tex !== 'string' || !tex.trim()) return null;
  if (/\\resumeSubheading\b/.test(tex) && /\\(resumeItem|resumeItemWithoutTitle|resumeSubItem)\b/.test(tex)) {
    return 'resumeSubheading';
  }
  if (hasLiveMacro(tex, /\\begin\{position\}/g) && hasLiveMacro(tex, /\\item\b/g)) return 'position';
  const hasTabularx = /\\usepackage\{[^}]*tabularx[^}]*\}/.test(tex) || /\\begin\{tabularx\}/.test(tex);
  const hasItemize = /\\begin\{itemize\}/.test(tex);
  if (hasTabularx && hasItemize && !/\\resumeSubheading\b/.test(tex)) {
    return 'tabularx-itemize';
  }
  return null;
}

/**
 * Index where the document body starts, so extraction can skip macro
 * definitions in the preamble (e.g. `\newcommand{\resumeSubItem}[2]{\resumeItem{#1}{#2}}`
 * would otherwise be captured as a `#1` slot).
 *
 * @param {string} tex
 * @returns {number}
 */
function bodyStart(tex) {
  const docStart = tex.indexOf('\\begin{document}');
  return docStart === -1 ? 0 : docStart;
}

/**
 * True when `idx` sits on a line that is commented out at that position —
 * i.e. an unescaped `%` appears earlier on the same line. Commented macro
 * calls are inert LaTeX (often old bullets kept for reference) and must not
 * become editable slots.
 *
 * @param {string} tex
 * @param {number} idx
 * @returns {boolean}
 */
function isCommentedAt(tex, idx) {
  const lineStart = tex.lastIndexOf('\n', idx - 1) + 1;
  for (let i = lineStart; i < idx; i++) {
    if (tex[i] === '\\') {
      i++; // skip escaped char (\% is a literal percent)
      continue;
    }
    if (tex[i] === '%') return true;
  }
  return false;
}

/**
 * Extract macro argument bodies as editable slots. Spans are absolute
 * offsets into `tex`; scanning starts at the document body.
 *
 * `useNextGroupIfEmpty` handles the common `\resumeItemWithoutTitle{}{Text}`
 * pattern (one-parameter macro called with an empty first group followed by a
 * plain braced group): when the captured group is empty/whitespace, the slot
 * points at the immediately following braced group instead.
 *
 * @param {string} tex
 * @param {string} macroName
 * @param {string} kind
 * @param {{useNextGroupIfEmpty?: boolean}} [opts]
 * @returns {Array<{id: string, kind: string, text: string, span: {start: number, end: number}}>}
 */
function extractMacroBodies(tex, macroName, kind, { useNextGroupIfEmpty = false } = {}) {
  const slots = [];
  const needle = `\\${macroName}{`;
  let searchFrom = bodyStart(tex);
  while (searchFrom < tex.length) {
    const idx = tex.indexOf(needle, searchFrom);
    if (idx === -1) break;
    if (isCommentedAt(tex, idx)) {
      searchFrom = idx + needle.length;
      continue;
    }
    const openBrace = idx + needle.length - 1;
    const closeBrace = findMatchingBrace(tex, openBrace);
    if (closeBrace === -1) break;
    let innerStart = openBrace + 1;
    let innerEnd = closeBrace;
    searchFrom = closeBrace + 1;

    if (useNextGroupIfEmpty && !tex.slice(innerStart, innerEnd).trim()) {
      let cursor = closeBrace + 1;
      while (cursor < tex.length && /\s/.test(tex[cursor])) cursor++;
      if (tex[cursor] !== '{') continue; // empty group with no follow-up group — nothing editable
      const openNext = cursor;
      const closeNext = findMatchingBrace(tex, openNext);
      if (closeNext === -1) break;
      innerStart = openNext + 1;
      innerEnd = closeNext;
      searchFrom = closeNext + 1;
    }

    slots.push({
      id: `${kind}-${slots.length}`,
      kind,
      text: tex.slice(innerStart, innerEnd),
      span: { start: innerStart, end: innerEnd },
    });
  }
  return slots;
}

/**
 * Extract the value argument of `\resumeSubItem{Category}{Items}` calls as
 * skill slots. The category (first group) is left untouched; only the second
 * group is editable.
 *
 * @param {string} tex
 * @returns {Array<{kind: string, text: string, span: {start: number, end: number}}>}
 */
function extractSubItemValues(tex) {
  const slots = [];
  const needle = '\\resumeSubItem{';
  let searchFrom = bodyStart(tex);
  while (searchFrom < tex.length) {
    const idx = tex.indexOf(needle, searchFrom);
    if (idx === -1) break;
    if (isCommentedAt(tex, idx)) {
      searchFrom = idx + needle.length;
      continue;
    }
    const openCat = idx + needle.length - 1;
    const closeCat = findMatchingBrace(tex, openCat);
    if (closeCat === -1) break;
    searchFrom = closeCat + 1;

    let cursor = closeCat + 1;
    while (cursor < tex.length && /\s/.test(tex[cursor])) cursor++;
    if (tex[cursor] !== '{') continue;
    const openVal = cursor;
    const closeVal = findMatchingBrace(tex, openVal);
    if (closeVal === -1) break;

    slots.push({
      kind: 'skill',
      text: tex.slice(openVal + 1, closeVal),
      span: { start: openVal + 1, end: closeVal },
    });
    searchFrom = closeVal + 1;
  }
  return slots;
}

/**
 * @param {string} tex
 * @returns {Array<{id: string, kind: string, text: string, span: {start: number, end: number}}>}
 */
function extractSkillValues(tex) {
  const slots = [];
  let searchFrom = bodyStart(tex);
  while (searchFrom < tex.length) {
    const idx = tex.indexOf('\\textbf{', searchFrom);
    if (idx === -1) break;
    if (isCommentedAt(tex, idx)) {
      searchFrom = idx + 8;
      continue;
    }
    const openCat = tex.indexOf('{', idx);
    const closeCat = findMatchingBrace(tex, openCat);
    if (closeCat === -1) break;

    let cursor = closeCat + 1;
    while (cursor < tex.length && /\s/.test(tex[cursor])) cursor++;
    if (tex[cursor] !== '{') {
      searchFrom = closeCat + 1;
      continue;
    }

    const openVal = cursor;
    const closeVal = findMatchingBrace(tex, openVal);
    if (closeVal === -1) break;

    const rawValue = tex.slice(openVal + 1, closeVal);
    const colon = rawValue.match(/^:\s*/);
    if (!colon) {
      searchFrom = closeVal + 1;
      continue;
    }

    const itemsStart = openVal + 1 + colon[0].length;
    const itemsText = tex.slice(itemsStart, closeVal);
    slots.push({
      kind: 'skill',
      text: itemsText,
      span: { start: itemsStart, end: closeVal },
    });
    searchFrom = closeVal + 1;
  }
  return slots;
}

/**
 * @param {string} tex
 * @returns {Array<{id: string, kind: string, text: string, span: {start: number, end: number}}>}
 */
function extractItemizeItems(tex) {
  const docStart = tex.indexOf('\\begin{document}');
  const body = docStart === -1 ? tex : tex.slice(docStart);
  const offset = docStart === -1 ? 0 : docStart;
  const slots = [];
  const itemRe = /\\item\b/g;
  let match;
  while ((match = itemRe.exec(body)) !== null) {
    if (isCommentedAt(body, match.index)) continue;
    let i = match.index + match[0].length;
    while (i < body.length && /\s/.test(body[i])) i++;

    if (body[i] === '{') {
      const openBrace = i;
      const closeBrace = findMatchingBrace(body, openBrace);
      if (closeBrace === -1) continue;
      slots.push({
        id: `item-${slots.length}`,
        kind: 'item',
        text: body.slice(openBrace + 1, closeBrace),
        span: { start: offset + openBrace + 1, end: offset + closeBrace },
      });
      continue;
    }

    const lineEnd = body.indexOf('\n', i);
    const end = lineEnd === -1 ? body.length : lineEnd;
    const text = body.slice(i, end).trim();
    if (!text) continue;
    slots.push({
      id: `item-${slots.length}`,
      kind: 'item',
      text,
      span: { start: offset + i, end: offset + end },
    });
  }
  return slots;
}


/**
 * True when `re` matches somewhere that is not commented out. Commented example
 * blocks (a template's own usage notes) must not make a document look like it
 * uses a layout it does not.
 * @param {string} tex
 * @param {RegExp} re global regex
 * @returns {boolean}
 */
function hasLiveMacro(tex, re) {
  const start = tex.indexOf('\\begin{document}');
  const body = start === -1 ? tex : tex.slice(start);
  const offset = start === -1 ? 0 : start;
  for (const m of body.matchAll(re)) {
    if (!isCommentedAt(tex, offset + m.index)) return true;
  }
  return false;
}

/**
 * Readable text for a slot written in the position layout: `{\\bf X}` and
 * `\\textbf{X}` become `**X**`, escaped specials lose their backslash, and
 * `\\textbullet{}` becomes a bullet character. Slots that still hold other
 * commands afterwards (links, underline) are not editable: a rewrite could not
 * keep them.
 * @param {string} text
 * @returns {{plain: string, editable: boolean}}
 */
export function latexToPlain(text) {
  let plain = text
    .replace(/\{\\(?:bf|bfseries)\s+([^{}]*)\}/g, '**$1**')
    .replace(/\\textbf\{([^{}]*)\}/g, '**$1**')
    .replace(/\\textbullet\{\}/g, '\u2022')
    .replace(/\\([%&$#_])/g, '$1');
  plain = plain.replace(/\s+/g, ' ').trim();
  return { plain, editable: !/\\[A-Za-z]/.test(plain) && !/[{}]/.test(plain) };
}

/**
 * The reverse of latexToPlain for a patch: escape every special character, then
 * turn `**X**` back into `{\\bf X}` and the bullet character into `\\textbullet{}`.
 * @param {string} text
 * @returns {string}
 */
export function plainToLatex(text) {
  return escapeLatex(text)
    .replace(/\*\*([^*]+)\*\*/g, '{\\bf $1}')
    .replace(/\u2022/g, '\\textbullet{}');
}

/**
 * Slots for the position layout (resume.cls): the summary paragraph, every
 * `\\item` inside a `\\begin{position}` block, and the Skills line.
 * @param {string} tex
 * @returns {Array<{id: string, kind: string, text: string, plain: string, editable: boolean, span: {start: number, end: number}}>}
 */
function extractPositionSlots(tex) {
  const start = bodyStart(tex);
  const slots = [];
  const add = (kind, text, from, to) => {
    const view = latexToPlain(text);
    slots.push({ id: `${kind}-${slots.filter((x) => x.kind === kind).length}`, kind, text, ...view, span: { start: from, end: to } });
  };

  // Summary: the braced group right after \section{Summary} \begin{content}.
  const summary = /\\section\{(?:Summary|Profile|About(?: me)?|Professional Summary)\}\s*\\begin\{content\}\s*/gi;
  summary.lastIndex = start;
  const sm = summary.exec(tex);
  if (sm && !isCommentedAt(tex, sm.index)) {
    const open = sm.index + sm[0].length;
    if (tex[open] === '{') {
      const close = findMatchingBrace(tex, open);
      if (close !== -1) add('summary', tex.slice(open + 1, close), open + 1, close);
    }
  }

  // Bullets: \item lines inside position blocks.
  const blockRe = /\\begin\{position\}/g;
  blockRe.lastIndex = start;
  let bm;
  while ((bm = blockRe.exec(tex)) !== null) {
    if (isCommentedAt(tex, bm.index)) continue;
    const end = tex.indexOf('\\end{position}', bm.index);
    if (end === -1) break;
    const itemRe = /\\item\b/g;
    itemRe.lastIndex = bm.index;
    let im;
    while ((im = itemRe.exec(tex)) !== null && im.index < end) {
      if (isCommentedAt(tex, im.index)) continue;
      let i = im.index + im[0].length;
      while (i < end && /[ \t]/.test(tex[i])) i++;
      const lineEnd = tex.indexOf('\n', i);
      const stop = Math.min(lineEnd === -1 ? tex.length : lineEnd, end);
      const raw = tex.slice(i, stop);
      const text = raw.replace(/\s+$/, '');
      if (text) add('bullet', text, i, i + text.length);
    }
    blockRe.lastIndex = end;
  }

  // Skills: the first live text line of \section{Skills} \begin{content}.
  const skills = /\\section\{Skills\}\s*\\begin\{content\}/g;
  skills.lastIndex = start;
  const km = skills.exec(tex);
  if (km && !isCommentedAt(tex, km.index)) {
    let pos = km.index + km[0].length;
    const stopAt = tex.indexOf('\\end{content}', pos);
    while (pos < stopAt) {
      const nl = tex.indexOf('\n', pos);
      const lineEnd = nl === -1 || nl > stopAt ? stopAt : nl;
      const line = tex.slice(pos, lineEnd);
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('%') && !trimmed.startsWith('\\vspace') && !trimmed.startsWith('\\sectionlineskip') && !trimmed.startsWith('\\begin') && !trimmed.startsWith('\\end')) {
        const lead = line.length - line.trimStart().length;
        add('skill', trimmed, pos + lead, pos + lead + trimmed.length);
        break;
      }
      pos = lineEnd + 1;
    }
  }
  return slots.sort((a, b) => a.span.start - b.span.start);
}

/**
 * @param {string} tex
 * @param {'resumeSubheading'|'tabularx-itemize'|'position'} family
 * @returns {Array<{id: string, kind: string, text: string, span: {start: number, end: number}}>}
 */
export function extractSlots(tex, family) {
  if (family === 'resumeSubheading') {
    const byPosition = (a, b) => a.span.start - b.span.start;
    const dedupe = (list) => {
      const seen = new Set();
      return list.filter(s => {
        const key = `${s.span.start}-${s.span.end}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const bullets = dedupe([
      ...extractMacroBodies(tex, 'resumeItem', 'bullet'),
      ...extractMacroBodies(tex, 'resumeItemWithoutTitle', 'bullet', { useNextGroupIfEmpty: true }),
    ].sort(byPosition)).map((s, i) => ({ ...s, id: `bullet-${i}` }));
    const skills = dedupe([
      ...extractSkillValues(tex),
      ...extractSubItemValues(tex),
    ].sort(byPosition)).map((s, i) => ({ ...s, id: `skill-${i}` }));
    return [...bullets, ...skills];
  }
  if (family === 'tabularx-itemize') {
    return extractItemizeItems(tex);
  }
  if (family === 'position') {
    return extractPositionSlots(tex);
  }
  return [];
}

/**
 * @param {string} texPath
 * @param {string} tex
 * @returns {{supported: boolean, family: string|null, source: string, slots: Array, error?: string, hint?: string}}
 */
export function buildManifest(texPath, tex) {
  const family = detectFamily(tex);
  if (!family) {
    return {
      supported: false,
      family: null,
      source: texPath,
      slots: [],
      error: UNSUPPORTED_HINT,
      hint: 'Place resume.tex in the project root or set latex.source in config/profile.yml.',
    };
  }

  const slots = extractSlots(tex, family);
  return {
    supported: true,
    family,
    source: texPath,
    slots,
  };
}

/**
 * @param {string} tex
 * @param {Array<{id: string, text: string}>} patches
 * @param {Array<{id: string, span: {start: number, end: number}}>} slots
 * @param {{escape?: boolean, family?: string | null}} [opts]
 * @returns {string}
 */
export function applyPatches(tex, patches, slots, { escape = true, family = null } = {}) {
  const seen = new Set();
  for (const patch of patches) {
    if (seen.has(patch.id)) throw new Error(`Duplicate patch id: ${patch.id}`);
    seen.add(patch.id);
  }
  const slotById = new Map(slots.map(s => [s.id, s]));
  const ordered = [...patches]
    .map(p => {
      const slot = slotById.get(p.id);
      if (!slot) return null;
      return { slot, text: p.text };
    })
    .filter(Boolean)
    .sort((a, b) => b.slot.span.start - a.slot.span.start);

  let out = tex;
  for (const { slot, text } of ordered) {
    // A slot holding commands a rewrite could not keep (links, underline) is left alone.
    if (family === 'position' && slot.editable === false) {
      throw new Error(`Slot ${slot.id} holds LaTeX commands and is not editable.`);
    }
    const replacement = !escape ? text : family === 'position' ? plainToLatex(text) : escapeLatex(text);
    out = out.slice(0, slot.span.start) + replacement + out.slice(slot.span.end);
  }
  return out;
}

// Pulls an ordered list of sprite names out of arbitrary text: a plain list,
// JSON, a markdown table, CSV/TSV, "name — description" lines, YAML-ish
// "key: value" blocks, XML/JS attributes.
//
// The text is read through many candidate extractors (which delimiter, which
// column, which part of the cell). Each yields a list of names. A known name
// of one sprite — the keyword — pins down the extractor that produces it;
// without one, the lists are scored on how name-like they look and on how
// well their length matches the number of sprites.

export interface NameCandidate {
  key: string;
  /** What was recognised, shown in the UI. */
  label: string;
  names: string[];
  score: number;
  /** Index of the keyword in `names`, -1 when there is no match. */
  match: number;
}

export interface NameSearch {
  keyword?: string;
  /** Number of sprites the names are for. */
  expected?: number;
}

interface Raw {
  key: string;
  label: string;
  names: string[];
  /** Column header or JSON key the values came from. */
  hint: string;
  transform: TransformId;
}

// ── value cleanup and transforms ─────────────────────────────────────────────

export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function clean(v: string): string {
  return v
    .trim()
    .replace(/^[*_`"'«“„\s]+|[*_`"'»”\s]+$/g, '')
    .replace(/[\s,;:.]+$/, '')
    .trim();
}

type TransformId = 'raw' | 'file' | 'last' | 'head' | 'mark';

interface Transform {
  id: TransformId;
  label: string;
  apply(v: string): string | null;
}

const IMAGE_EXT =
  /\.(?:png|jpe?g|webp|gif|svg|bmp|tga|tiff?|avif|ico|dds|psd|kra|ase|aseprite)$/i;

const TRANSFORMS: Transform[] = [
  { id: 'raw', label: '', apply: (v) => clean(v) || null },
  {
    // public/images/notables/spill.png → spill
    id: 'file',
    label: 'имя файла',
    apply: (v) => {
      const s = clean(v);
      if (!/[\\/]/.test(s) && !IMAGE_EXT.test(s)) return null;
      const base = s.split(/[\\/]/).pop() ?? '';
      return clean(base.replace(/\.[a-z][a-z0-9]{1,4}$/i, '')) || null;
    },
  },
  {
    // Область действия → Толпа → Разлив → Разлив
    id: 'last',
    label: 'последний уровень',
    apply: (v) => {
      const parts = clean(v).split(/\s*(?:→|->|=>|»|›|⟶|>|::)\s*/);
      return parts.length > 1 ? clean(parts[parts.length - 1]) || null : null;
    },
  },
  {
    // Arrow (fire variant) → Arrow
    id: 'head',
    label: 'до скобки',
    apply: (v) => {
      const m = /^(.+?)\s*[([{]/.exec(clean(v));
      return m ? clean(m[1]) || null : null;
    },
  },
  {
    // The **Arrow** of fire → Arrow
    id: 'mark',
    label: 'выделенное',
    apply: (v) => {
      const m = /\*\*(.+?)\*\*|__(.+?)__|`([^`]+)`|«([^»]+)»|"([^"]+)"|“([^”]+)”/.exec(v);
      const s = m?.slice(1).find(Boolean);
      return s ? clean(s) || null : null;
    },
  },
];

/**
 * One candidate per transform over a column of values. A transform that fails
 * on some cell falls back to the cleaned cell, so positions stay aligned with
 * the sprites; it must apply to at least half the cells to be worth listing.
 */
function withTransforms(
  base: Omit<Raw, 'names' | 'transform' | 'label'> & { label: string },
  values: string[],
  out: Raw[]
) {
  for (const t of TRANSFORMS) {
    let hits = 0;
    const names = values.map((v) => {
      const r = t.apply(v);
      if (r !== null) hits++;
      return r ?? clean(v);
    });
    if (!hits || (t.id !== 'raw' && hits < values.length * 0.5)) continue;
    out.push({
      key: `${base.key}:${t.id}`,
      label: t.label ? `${base.label} · ${t.label}` : base.label,
      names,
      hint: base.hint,
      transform: t.id,
    });
  }
}

// ── JSON ─────────────────────────────────────────────────────────────────────

function parseJson(text: string): unknown {
  const t = text
    .trim()
    .replace(/^```[\w-]*\s*/, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(t);
  } catch {
    /* try harder below */
  }
  const a = t.search(/[[{]/);
  const b = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(t.slice(a, b + 1));
    } catch {
      /* not a single document */
    }
  }
  // JSON Lines
  const lines = t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 1 && lines.every((l) => /^[[{]/.test(l))) {
    try {
      return lines.map((l) => JSON.parse(l));
    } catch {
      /* not JSONL either */
    }
  }
  return undefined;
}

/**
 * Collects leaf values by structural path, array indices collapsed to `[]`:
 * `{ sprites: [{ name }, { name }] }` puts both names into `sprites[].name`.
 * An object whose values are all objects is treated as a dictionary keyed by
 * name (`{ "arrow": {...}, "bow": {...} }`): its keys become a list too, and
 * its entries share one path so their fields line up.
 */
function jsonCandidates(root: unknown, out: Raw[]) {
  const buckets = new Map<string, string[]>();
  const add = (sig: string, v: string) => {
    const list = buckets.get(sig);
    if (list) list.push(v);
    else buckets.set(sig, [v]);
  };
  const walk = (node: unknown, sig: string, depth: number) => {
    if (node === null || node === undefined || depth > 8) return;
    if (typeof node === 'string' || typeof node === 'number') {
      add(sig, String(node));
      return;
    }
    if (Array.isArray(node)) {
      for (const el of node) walk(el, `${sig}[]`, depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const keys = Object.keys(obj);
    const isDict =
      keys.length >= 2 &&
      keys.every(
        (k) => obj[k] && typeof obj[k] === 'object' && !Array.isArray(obj[k])
      );
    if (isDict) {
      for (const k of keys) {
        add(`${sig}{}`, k);
        walk(obj[k], `${sig}.*`, depth + 1);
      }
      return;
    }
    for (const k of keys) walk(obj[k], sig ? `${sig}.${k}` : k, depth + 1);
  };
  walk(root, '', 0);

  for (const [sig, values] of buckets) {
    const pretty = sig.endsWith('{}')
      ? `ключи ${sig.slice(0, -2) || 'объекта'}`
      : sig.replace(/^\./, '');
    const hint = sig.endsWith('{}')
      ? 'name'
      : (sig.split(/[.[\]{}*]+/).filter(Boolean).pop() ?? '');
    withTransforms(
      { key: `json:${sig}`, label: `JSON · ${pretty}`, hint },
      values,
      out
    );
  }
}

// ── line-based text ──────────────────────────────────────────────────────────

interface Line {
  text: string;
  /** "## Weapons", "Weapons:" — section titles, never names. */
  heading: boolean;
  /** Markdown table row directly above a |---| separator. */
  tableHeader: boolean;
}

const LIST_MARKER = /^(?:[-*+•·▪►]|\d{1,4}[.)]|[a-zа-я][.)])\s+/i;

function readLines(text: string): Line[] {
  const out: Line[] = [];
  let prevTable = false;
  for (const raw of text.split('\n')) {
    const t = raw.trim();
    if (!t || t.startsWith('```')) {
      prevTable = false;
      continue;
    }
    if (/^[|:\-\s]+$/.test(t) && t.includes('-')) {
      if (prevTable && out.length) out[out.length - 1].tableHeader = true;
      prevTable = false;
      continue;
    }
    const heading = /^#{1,6}\s/.test(t) || (t.endsWith(':') && !t.includes('|'));
    const body = t.replace(/^#{1,6}\s+/, '').replace(LIST_MARKER, '').trim();
    if (!body) continue;
    out.push({ text: body, heading, tableHeader: false });
    prevTable = t.startsWith('|');
  }
  return out;
}

function splitQuoted(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    if (ch === sep && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** At most `limit` fields; the tail keeps any extra separators. */
function limitFields(fields: string[], limit: number, sep: string): string[] {
  if (fields.length <= limit) return fields;
  return [...fields.slice(0, limit - 1), fields.slice(limit - 1).join(sep)];
}

interface Delim {
  id: string;
  label: string;
  /** Column names for two-field formats. */
  columns?: [string, string];
  split(line: string): string[] | null;
  /** Rejoin separator, for delimiters whose last field may hold more. */
  sep?: string;
}

function splitOnce(line: string, re: RegExp): string[] | null {
  const m = re.exec(line);
  if (!m || m.index === 0) return null;
  return [line.slice(0, m.index), line.slice(m.index + m[0].length)];
}

const DELIMS: Delim[] = [
  {
    id: 'pipe',
    label: 'Таблица',
    split: (l) =>
      l.includes('|') ? l.replace(/^\|/, '').replace(/\|$/, '').split('|') : null,
  },
  {
    id: 'tab',
    label: 'TSV',
    split: (l) => (l.includes('\t') ? l.split('\t') : null),
  },
  {
    id: 'semi',
    label: 'Через «;»',
    sep: ';',
    split: (l) => (l.includes(';') ? splitQuoted(l, ';') : null),
  },
  {
    id: 'comma',
    label: 'CSV',
    sep: ',',
    split: (l) => (l.includes(',') ? splitQuoted(l, ',') : null),
  },
  {
    id: 'dash',
    label: 'Строки с тире',
    columns: ['до тире', 'после тире'],
    split: (l) => splitOnce(l, /\s+[—–-]{1,2}\s+/),
  },
  {
    id: 'colon',
    label: 'Строки с «:»',
    columns: ['до двоеточия', 'после двоеточия'],
    split: (l) => splitOnce(l, /\s*:\s+/),
  },
  {
    id: 'eq',
    label: 'Строки с «=»',
    columns: ['до «=»', 'после «=»'],
    split: (l) => splitOnce(l, /\s*=\s*/),
  },
];

const NAME_HINT =
  /^(name|names|id|key|title|label|sprite|icon|file|filename|image|img|slug|имя|название|наименование|спрайт|файл|иконка|изображение|картинка)$/;
const DESC_HINT =
  /^(description|desc|details|text|effect|notes|comment|summary|описание|эффект|текст|детали|примечание|комментарий)$/;

function delimitedCandidates(lines: Line[], keyword: string, out: Raw[]) {
  const records = lines.filter((l) => !l.heading);
  for (const d of DELIMS) {
    const split = records.map((l) => d.split(l.text));
    const counts = new Map<number, number>();
    for (const f of split) {
      if (f && f.length >= 2) counts.set(f.length, (counts.get(f.length) ?? 0) + 1);
    }
    if (!counts.size) continue;

    // Candidate shapes: the common field counts, plus the keyword's row.
    const shapes = new Set(
      [...counts]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([n]) => n)
    );
    if (keyword) {
      split.forEach((f) => {
        if (f && f.some((v) => norm(v).includes(keyword))) shapes.add(f.length);
      });
    }

    for (const m of shapes) {
      let rows = records
        .map((line, i) => ({
          line,
          fields: d.sep ? limitFields(split[i] ?? [], m, d.sep) : (split[i] ?? []),
        }))
        .filter((r) => r.fields.length === m);
      if (!rows.length) continue;

      // Markdown header rows sit above a |---| line; in CSV/TSV the first row
      // is a header when it names its columns. "name: arrow" is data, so
      // two-field formats never have one.
      let header: string[] | null = null;
      const headerRows = rows.filter((r) => r.line.tableHeader);
      if (headerRows.length) {
        header = headerRows[0].fields;
        rows = rows.filter((r) => !r.line.tableHeader);
      } else if (
        !d.columns &&
        rows.length > 2 &&
        rows[0].fields.some((f) => NAME_HINT.test(norm(f)) || DESC_HINT.test(norm(f))) &&
        !rows[0].fields.some((f) => keyword && norm(f) === keyword)
      ) {
        header = rows[0].fields;
        rows = rows.slice(1);
      }
      if (!rows.length) continue;

      const limit = Math.min(m, 8);
      for (let i = 0; i < limit; i++) {
        const col = header?.[i] ? clean(header[i]) : '';
        const colLabel = col
          ? `«${col}»`
          : (d.columns?.[i] ?? `колонка ${i + 1}`);
        withTransforms(
          {
            key: `${d.id}${m}:${i}`,
            label: `${d.label} · ${colLabel}`,
            hint: norm(col),
          },
          rows.map((r) => r.fields[i]),
          out
        );
      }

      // YAML-ish blocks repeat the same keys per item: "name: arrow",
      // "description: …", "name: bow". Group the values by key.
      if (d.id === 'colon' || d.id === 'eq') {
        const byKey = new Map<string, { label: string; values: string[] }>();
        for (const r of rows) {
          const k = norm(r.fields[0]);
          if (!k || k.length > 30) continue;
          const g = byKey.get(k);
          if (g) g.values.push(r.fields[1]);
          else byKey.set(k, { label: clean(r.fields[0]), values: [r.fields[1]] });
        }
        if (byKey.size < rows.length) {
          for (const [k, g] of byKey) {
            if (g.values.length < 2) continue;
            withTransforms(
              { key: `${d.id}-key:${k}`, label: `Ключ «${g.label}»`, hint: k },
              g.values,
              out
            );
          }
        }
      }
    }
  }
}

/** name="arrow", 'name': 'arrow', "name": "arrow" anywhere in the text. */
function attributeCandidates(text: string, out: Raw[]) {
  const re =
    /(["']?)([\p{L}_][\p{L}\p{N}_-]*)\1\s*[:=]\s*(["'`])((?:(?!\3)[^\n]){1,200})\3/gu;
  const byKey = new Map<string, { label: string; values: string[] }>();
  for (const m of text.matchAll(re)) {
    const k = norm(m[2]);
    const g = byKey.get(k);
    if (g) g.values.push(m[4]);
    else byKey.set(k, { label: m[2], values: [m[4]] });
  }
  for (const [k, g] of byKey) {
    if (g.values.length < 2) continue;
    withTransforms(
      { key: `attr:${k}`, label: `Поле «${g.label}»`, hint: k },
      g.values,
      out
    );
  }
}

function lineCandidates(text: string, lines: Line[], out: Raw[]) {
  const plain = lines.filter((l) => !l.heading && !l.tableHeader);
  if (plain.length) {
    withTransforms(
      { key: 'line', label: 'Каждая строка', hint: '' },
      plain.map((l) => l.text),
      out
    );
  }

  // "arrow, bow, sword" — several names per line.
  const items = text
    .split(/[,;\n]+/)
    .map((s) => clean(s.replace(LIST_MARKER, '')))
    .filter(Boolean);
  if (items.length > plain.length + 1) {
    withTransforms(
      { key: 'inline', label: 'Список через запятую', hint: '' },
      items,
      out
    );
  }

  // "arrow bow sword" — one line of bare words.
  if (plain.length === 1 && items.length === 1) {
    const words = plain[0].text.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      withTransforms(
        { key: 'words', label: 'Слова через пробел', hint: '' },
        words,
        out
      );
    }
  }
}

// ── scoring ──────────────────────────────────────────────────────────────────

function nameLikeness(s: string): number {
  if (!s) return 0;
  const len = [...s].length;
  const words = s.split(/\s+/).length;
  let v = 1;
  if (len > 40) v -= 0.6;
  else if (len > 24) v -= 0.25;
  if (words > 4) v -= 0.4;
  else if (words > 2) v -= 0.15;
  if (/[.!?%+]\s|[,;]/.test(s)) v -= 0.3;
  if (/^[\d\s.,:+\-−%]+$/.test(s)) v -= 0.7;
  if (/[\\/|{}<>]/.test(s)) v -= 0.4;
  if (/^[\p{L}_][\p{L}\p{N}_-]*$/u.test(s)) v += 0.15;
  return Math.max(0, v);
}

function score(c: Raw, expected: number | undefined, keyed: boolean): number {
  const n = c.names.length;
  if (!n) return -Infinity;
  let like = 0;
  for (const s of c.names) like += nameLikeness(s);
  like /= n;
  const unique = new Set(c.names.map(norm)).size / n;
  const fit = expected
    ? Math.max(0, 1 - Math.abs(n - expected) / Math.max(expected, 1))
    : 0.5;
  const hint = NAME_HINT.test(c.hint) ? 0.25 : DESC_HINT.test(c.hint) ? -0.3 : 0;
  // With a keyword the exact cell text is what the user typed; derived parts
  // (last path segment, text before a bracket) only win when nothing else
  // matches.
  const derived = c.transform === 'raw' ? 0 : keyed ? 0.4 : 0.05;
  const lonely = n < 2 ? 0.5 : 0;
  return like + unique * 0.6 + fit * 0.8 + hint - derived - lonely;
}

// ── entry point ──────────────────────────────────────────────────────────────

export function findNameCandidates(
  text: string,
  search: NameSearch = {}
): NameCandidate[] {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!src.trim()) return [];
  const keyword = norm(search.keyword ?? '');

  const raw: Raw[] = [];
  const json = parseJson(src);
  if (json !== undefined && typeof json === 'object') jsonCandidates(json, raw);
  if (!raw.length) {
    const lines = readLines(src);
    delimitedCandidates(lines, keyword, raw);
    attributeCandidates(src, raw);
    lineCandidates(src, lines, raw);
  }

  let scored = raw.map((c) => ({
    ...c,
    match: keyword ? c.names.findIndex((n) => norm(n) === keyword) : -1,
    score: score(c, search.expected, !!keyword),
  }));

  if (keyword) {
    const exact = scored.filter((c) => c.match >= 0);
    if (exact.length) {
      scored = exact;
    } else {
      // Loose match: the keyword is part of a name ("arrow" in "Arrow_Fire").
      const loose = scored
        .map((c) => ({
          ...c,
          match: keyword.length >= 3
            ? c.names.findIndex((n) => norm(n).includes(keyword))
            : -1,
        }))
        .filter((c) => c.match >= 0);
      if (loose.length) scored = loose.map((c) => ({ ...c, score: c.score - 0.5 }));
    }
  }

  // Different extractors often agree (a column and its JSON twin); keep the
  // best-scoring one per distinct list.
  const best = new Map<string, (typeof scored)[number]>();
  for (const c of scored) {
    const sig = c.names.map(norm).join('\u0001');
    const cur = best.get(sig);
    if (!cur || c.score > cur.score) best.set(sig, c);
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ key, label, names, score, match }) => ({
      key,
      label,
      names,
      score,
      match,
    }));
}

// Python-compatible helpers. The classification cache key must equal pipeline/analyze.py's key
// (sha1(qver + json.dumps(state, sort_keys=True))[:16]) so imported classifications stay valid.

/** json.dumps(obj, sort_keys=True) with Python's defaults (ensure_ascii, ", " and ": " separators). */
export function pyDumps(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (v === true) return "true";
  if (v === false) return "false";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : pyFloat(v);
  if (typeof v === "string") return pyStr(v);
  if (Array.isArray(v)) return "[" + v.map(pyDumps).join(", ") + "]";
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort(pyCompare);
  return "{" + keys.map(k => pyStr(k) + ": " + pyDumps(o[k])).join(", ") + "}";
}

// Python sorts str keys by code point; JS default sort compares UTF-16 units (same for the BMP).
function pyCompare(a: string, b: string): number {
  const A = Array.from(a), B = Array.from(b);
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const x = A[i].codePointAt(0)!, y = B[i].codePointAt(0)!;
    if (x !== y) return x - y;
  }
  return A.length - B.length;
}

function pyFloat(n: number): string {
  let s = String(n);
  if (/e/.test(s)) s = s.replace(/e([+-])(\d)$/, "e$10$2");
  return s;
}

const NAMED: Record<number, string> = { 0x22: '\\"', 0x5c: "\\\\", 0x0a: "\\n", 0x0d: "\\r", 0x09: "\\t", 0x08: "\\b", 0x0c: "\\f" };

export function pyStr(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const n = NAMED[c];
    if (n) out += n;
    else if (c < 0x20 || c > 0x7e) out += "\\u" + c.toString(16).padStart(4, "0");
    else out += s[i];
  }
  return out + '"';
}

// str.split() with no argument: Python's whitespace set (str.isspace).
const PY_WS = new RegExp("[\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000]+");
export function pySplit(s: string): string[] {
  return s.split(PY_WS).filter(Boolean);
}

/** s[:n] on code points, like Python slicing. */
export function pySlice(s: string, n: number): string {
  if (s.length <= n) return s; // fewer UTF-16 units than n means fewer code points too
  const cps = Array.from(s);
  return cps.length <= n ? s : cps.slice(0, n).join("");
}

export async function sha1hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, "0")).join("");
}

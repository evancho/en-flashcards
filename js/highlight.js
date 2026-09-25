function isWordChar(char) {
  return /[0-9A-Za-z]/.test(char || "");
}

export function findTermRanges(text, term) {
  const source = String(text ?? "");
  const needle = String(term ?? "").trim();
  if (!source || !needle) return [];
  const lower = source.toLowerCase();
  const key = needle.toLowerCase();
  const ranges = [];
  let from = 0;
  while (from < lower.length) {
    const start = lower.indexOf(key, from);
    if (start < 0) break;
    const end = start + key.length;
    const leftOk = !isWordChar(key[0]) || !isWordChar(lower[start - 1]);
    const rightOk = !isWordChar(key[key.length - 1]) || !isWordChar(lower[end]);
    if (leftOk && rightOk) {
      ranges.push({ start, end });
      from = end;
    } else {
      from = start + 1;
    }
  }
  return ranges;
}

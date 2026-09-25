export const SETTINGS_KEY = "en-flashcards.settings";

export function readSettings(storage) {
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return { random: false, reverse: false };
    const data = JSON.parse(raw);
    return {
      random: data?.random === true,
      reverse: data?.reverse === true,
    };
  } catch {
    return { random: false, reverse: false };
  }
}

export function writeSettings(storage, settings) {
  storage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      random: settings?.random === true,
      reverse: settings?.reverse === true,
    }),
  );
}

export function buildCommuteQueue(cards, now, { random = false, randomFn = Math.random } = {}) {
  const list = Array.isArray(cards) ? cards.filter(Boolean) : [];
  const byDue = (a, b) => (a.due ?? 0) - (b.due ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0);
  const due = list.filter((card) => card.due <= now).sort(byDue);
  const source = (due.length ? due : [...list].sort(byDue)).slice();
  if (random) shuffleInPlace(source, randomFn);
  return source;
}

export function commuteLines(card) {
  const lines = [];
  const push = (text, lang, kind) => {
    const line = String(text ?? "").trim();
    if (line) lines.push({ text: line, lang, kind });
  };
  push(card?.front, "en", "front");
  push(card?.back, "zh", "back");
  push(card?.example, "en", "example");
  push(card?.exampleZh, "zh", "exampleZh");
  return lines;
}

export function shuffleInPlace(list, random = Math.random) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = list[i];
    list[i] = list[j];
    list[j] = swap;
  }
  return list;
}

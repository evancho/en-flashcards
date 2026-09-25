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

export function shuffleInPlace(list, random = Math.random) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const swap = list[i];
    list[i] = list[j];
    list[j] = swap;
  }
  return list;
}

import { schedule } from "./srs.js";

export const STORAGE_KEY = "en-flashcards.v1";
const MAX_FRONT = 300;
const MAX_BACK = 1000;
const MAX_EXAMPLE = 500;

function optionalText(value, max) {
  const text = String(value ?? "").trim().slice(0, max);
  return text || "";
}

function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function normalizeCard(raw, now = Date.now()) {
  if (!raw || typeof raw !== "object") return null;
  const front = String(raw.front ?? "").trim().slice(0, MAX_FRONT);
  const back = String(raw.back ?? "").trim().slice(0, MAX_BACK);
  if (!front || !back) return null;
  const id = typeof raw.id === "string" && /^[\w-]{1,80}$/.test(raw.id) ? raw.id : uid();
  const horizon = now + 100 * 365 * 24 * 60 * 60 * 1000;
  const card = {
    id,
    front,
    back,
    createdAt: clamp(num(raw.createdAt, now), 0, horizon),
    updatedAt: clamp(num(raw.updatedAt, now), 0, horizon),
    due: clamp(num(raw.due, now), 0, horizon),
    interval: clamp(Math.round(num(raw.interval, 0)), 0, 365),
    ease: clamp(Math.round(num(raw.ease, 2.5) * 100) / 100, 1.3, 3.5),
    reps: clamp(Math.round(num(raw.reps, 0)), 0, 1_000_000),
    lapses: clamp(Math.round(num(raw.lapses, 0)), 0, 1_000_000),
    step: Number(raw.step) >= 1 ? 1 : 0,
  };
  const example = optionalText(raw.example, MAX_EXAMPLE);
  const exampleZh = optionalText(raw.exampleZh, MAX_EXAMPLE);
  if (example) card.example = example;
  if (exampleZh) card.exampleZh = exampleZh;
  return card;
}

function fillMissingExample(existing, incoming) {
  const next = { ...existing };
  let changed = false;
  if (!existing.example && incoming.example) {
    next.example = incoming.example;
    changed = true;
  }
  if (!existing.exampleZh && incoming.exampleZh) {
    next.exampleZh = incoming.exampleZh;
    changed = true;
  }
  return changed ? next : null;
}

export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const error = new Error("invalid-json");
    error.code = "invalid-json";
    throw error;
  }
  const list = Array.isArray(data) ? data : data && Array.isArray(data.cards) ? data.cards : null;
  if (!list) {
    const error = new Error("invalid-shape");
    error.code = "invalid-shape";
    throw error;
  }
  return list;
}

export function createStore(storage) {
  function readRaw() {
    try {
      return storage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function load() {
    const raw = readRaw();
    if (!raw) return { cards: [], corrupt: false, raw: null };
    try {
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : null;
      if (!list) return { cards: [], corrupt: true, raw };
      const cards = [];
      const seen = new Set();
      for (const item of list) {
        const card = normalizeCard(item);
        if (!card || seen.has(card.id)) continue;
        seen.add(card.id);
        cards.push(card);
      }
      return { cards, corrupt: false, raw };
    } catch {
      return { cards: [], corrupt: true, raw };
    }
  }

  function persist(cards) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(cards));
    } catch (cause) {
      const error = new Error("save-failed");
      error.code = "save-failed";
      error.cause = cause;
      throw error;
    }
  }

  function requireCards() {
    const snapshot = load();
    if (snapshot.corrupt) {
      const error = new Error("corrupt");
      error.code = "corrupt";
      throw error;
    }
    return snapshot.cards;
  }

  function blankCard(front, back, now, extras = {}) {
    const card = normalizeCard(
      {
        id: uid(),
        front,
        back,
        example: extras.example,
        exampleZh: extras.exampleZh,
        createdAt: now,
        updatedAt: now,
        due: now,
        interval: 0,
        ease: 2.5,
        reps: 0,
        lapses: 0,
        step: 0,
      },
      now,
    );
    if (!card) {
      const error = new Error("empty");
      error.code = "empty";
      throw error;
    }
    return card;
  }

  return {
    load,
    get(id) {
      return load().cards.find((card) => card.id === id) ?? null;
    },
    add(front, back, now = Date.now(), extras = {}) {
      const cards = requireCards();
      const card = blankCard(front, back, now, extras);
      cards.push(card);
      persist(cards);
      return card;
    },
    updateText(id, front, back, now = Date.now(), extras) {
      const cards = requireCards();
      const next = cards.map((card) => {
        if (card.id !== id) return card;
        const patch = { ...card, front, back, updatedAt: now };
        if (extras) {
          patch.example = extras.example ?? "";
          patch.exampleZh = extras.exampleZh ?? "";
        }
        const updated = normalizeCard(patch, now);
        if (!updated) {
          const error = new Error("empty");
          error.code = "empty";
          throw error;
        }
        return { ...updated, id: card.id };
      });
      if (!next.some((card) => card.id === id)) return null;
      persist(next);
      return next.find((card) => card.id === id) ?? null;
    },
    remove(id) {
      const cards = requireCards();
      persist(cards.filter((card) => card.id !== id));
    },
    review(id, rating, now = Date.now()) {
      const cards = requireCards();
      let updated = null;
      const next = cards.map((card) => {
        if (card.id !== id) return card;
        updated = { ...card, ...schedule(card, rating, now), updatedAt: now };
        return updated;
      });
      if (!updated) return null;
      persist(next);
      return updated;
    },
    replaceAll(list) {
      const cards = [];
      const seen = new Set();
      let skipped = 0;
      for (const raw of list) {
        const card = normalizeCard(raw);
        if (!card || seen.has(card.id)) {
          skipped += 1;
          continue;
        }
        seen.add(card.id);
        cards.push(card);
      }
      persist(cards);
      return { added: cards.length, updated: 0, skipped, total: cards.length };
    },
    merge(list) {
      const cards = requireCards();
      const map = new Map(cards.map((card) => [card.id, card]));
      let added = 0;
      let updated = 0;
      let skipped = 0;
      for (const raw of list) {
        const card = normalizeCard(raw);
        if (!card) {
          skipped += 1;
          continue;
        }
        if (map.has(card.id)) updated += 1;
        else added += 1;
        map.set(card.id, card);
      }
      const next = [...map.values()];
      persist(next);
      return { added, updated, skipped, total: next.length };
    },
    mergeSkipExisting(list) {
      const cards = requireCards();
      const byId = new Map(cards.map((card) => [card.id, card]));
      const byFront = new Map(cards.map((card) => [card.front.trim().toLowerCase(), card]));
      const next = cards.slice();
      let added = 0;
      let skipped = 0;
      let filled = 0;
      for (const raw of list) {
        const card = normalizeCard(raw);
        if (!card) {
          skipped += 1;
          continue;
        }
        const frontKey = card.front.trim().toLowerCase();
        const existing = byId.get(card.id) || byFront.get(frontKey);
        if (existing) {
          const patched = fillMissingExample(existing, card);
          if (!patched) {
            skipped += 1;
            continue;
          }
          const index = next.findIndex((item) => item.id === existing.id);
          next[index] = patched;
          byId.set(existing.id, patched);
          byFront.set(existing.front.trim().toLowerCase(), patched);
          filled += 1;
          continue;
        }
        byId.set(card.id, card);
        byFront.set(frontKey, card);
        next.push(card);
        added += 1;
      }
      if (added > 0 || filled > 0) persist(next);
      return { added, skipped, filled, total: next.length };
    },
    reset() {
      try {
        storage.removeItem(STORAGE_KEY);
      } catch (cause) {
        const error = new Error("save-failed");
        error.code = "save-failed";
        error.cause = cause;
        throw error;
      }
    },
    stats(now = Date.now()) {
      const { cards, corrupt } = load();
      return {
        total: cards.length,
        due: cards.filter((card) => card.due <= now).length,
        corrupt,
      };
    },
    nextDue(now = Date.now()) {
      const upcoming = load()
        .cards.filter((card) => card.due > now)
        .sort((a, b) => a.due - b.due);
      return upcoming[0]?.due ?? null;
    },
    exportPayload(now = Date.now()) {
      return {
        version: 1,
        exportedAt: new Date(now).toISOString(),
        app: "en-flashcards",
        cards: load().cards,
      };
    },
  };
}

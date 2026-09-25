import assert from "node:assert/strict";
import test from "node:test";
import { createStore, parseImport, STORAGE_KEY } from "../js/store.js";

function memory() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

test("add, review, edit, and export stay on this device storage", () => {
  const storage = memory();
  const store = createStore(storage);
  const now = 1_700_000_000_000;
  const card = store.add("  apple ", " 蘋果 ", now);
  assert.equal(card.front, "apple");
  assert.equal(card.back, "蘋果");
  assert.equal(store.stats(now).due, 1);

  const reviewed = store.review(card.id, "easy", now);
  assert.equal(reviewed.interval, 4);
  assert.equal(store.stats(now).due, 0);
  assert.equal(store.nextDue(now), reviewed.due);

  const edited = store.updateText(card.id, "apple", "蘋果；水果", now + 5);
  assert.equal(edited.interval, 4);
  assert.equal(edited.back, "蘋果；水果");

  const payload = store.exportPayload(now);
  assert.equal(payload.version, 1);
  assert.equal(payload.app, "en-flashcards");
  assert.equal(payload.cards.length, 1);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY))[0].front, "apple");
});

test("merge keeps ids and replace drops local cards", () => {
  const store = createStore(memory());
  const first = store.add("apple", "蘋果");
  const second = store.add("book", "書");
  const merged = store.merge([
    { ...first, back: "蘋果，一種水果" },
    { id: "pear-1", front: "pear", back: "梨子", due: Date.now() },
    { front: "   ", back: "略過" },
  ]);
  assert.deepEqual(
    { added: merged.added, updated: merged.updated, skipped: merged.skipped },
    { added: 1, updated: 1, skipped: 1 },
  );
  assert.equal(store.get(first.id).back, "蘋果，一種水果");
  assert.equal(store.get(second.id).front, "book");

  const replaced = store.replaceAll([{ id: "only", front: "quiet", back: "安靜的" }]);
  assert.equal(replaced.total, 1);
  assert.equal(store.stats().total, 1);
  assert.equal(store.get("only").front, "quiet");
});

test("starter merge skips the same id or front and leaves existing cards", () => {
  const store = createStore(memory());
  const kept = store.add("api", "我自己的註記");
  const before = store.get(kept.id);
  const result = store.mergeSkipExisting([
    { id: kept.id, front: "other", back: "不該蓋掉" },
    { id: "tech-002", front: "API", back: "應用程式介面" },
    { id: "tech-003", front: "endpoint", back: "端點" },
    { front: "   ", back: "略過" },
  ]);
  assert.equal(result.added, 1);
  assert.equal(result.skipped, 3);
  assert.equal(store.stats().total, 2);
  assert.deepEqual(store.get(kept.id), before);
  assert.equal(store.get("tech-003").back, "端點");
  assert.equal(store.get("tech-002"), null);

  const again = store.mergeSkipExisting([{ id: "tech-003", front: "endpoint", back: "改寫" }]);
  assert.equal(again.added, 0);
  assert.equal(store.get("tech-003").back, "端點");
});

test("examples survive export and can be cleared without touching other fields", () => {
  const store = createStore(memory());
  const card = store.add("cache", "快取", 1_700_000_000_000, {
    example: "The cache is warm.",
    exampleZh: "快取是熱的。",
  });
  assert.equal(store.exportPayload(1_700_000_000_000).cards[0].example, "The cache is warm.");
  assert.equal(store.exportPayload(1_700_000_000_000).cards[0].exampleZh, "快取是熱的。");
  store.updateText(card.id, "cache", "快取", 1_700_000_000_000);
  assert.equal(store.get(card.id).example, "The cache is warm.");
  store.updateText(card.id, "cache", "快取", 1_700_000_000_000, { example: "  ", exampleZh: "" });
  assert.equal(store.get(card.id).example, undefined);
  assert.equal(store.get(card.id).exampleZh, undefined);
});

test("reloading the starter deck fills a missing example and keeps progress", () => {
  const store = createStore(memory());
  const card = store.add("api", "我自己的註記");
  const reviewed = store.review(card.id, "easy");
  const result = store.mergeSkipExisting([
    {
      id: "tech-001",
      front: "API",
      back: "應用程式介面",
      example: "The app calls an API.",
      exampleZh: "App 會呼叫 API。",
      interval: 0,
      reps: 0,
      due: 1,
    },
  ]);
  assert.equal(result.added, 0);
  assert.equal(result.filled, 1);
  assert.equal(store.stats().total, 1);
  const after = store.get(card.id);
  assert.equal(after.example, "The app calls an API.");
  assert.equal(after.exampleZh, "App 會呼叫 API。");
  assert.equal(after.back, "我自己的註記");
  assert.equal(after.interval, reviewed.interval);
  assert.equal(after.reps, reviewed.reps);
  assert.equal(after.due, reviewed.due);
  const second = store.mergeSkipExisting([
    { id: "tech-001", front: "API", back: "別的", example: "A different sentence." },
  ]);
  assert.equal(second.filled, 0);
  assert.equal(second.added, 0);
  assert.equal(store.get(card.id).example, "The app calls an API.");
});

test("reloading fills a missing Chinese gloss and keeps the English example", () => {
  const store = createStore(memory());
  const card = store.add("api", "我自己的註記", 1_700_000_000_000, { example: "The app calls an API." });
  const reviewed = store.review(card.id, "easy");
  const result = store.mergeSkipExisting([
    {
      id: "tech-001",
      front: "API",
      back: "應用程式介面",
      example: "A different sentence.",
      exampleZh: "App 會呼叫 API。",
      interval: 0,
      reps: 0,
      due: 1,
    },
  ]);
  assert.equal(result.filled, 1);
  assert.equal(result.added, 0);
  const after = store.get(card.id);
  assert.equal(after.example, "The app calls an API.");
  assert.equal(after.exampleZh, "App 會呼叫 API。");
  assert.equal(after.back, "我自己的註記");
  assert.equal(after.interval, reviewed.interval);
  assert.equal(after.reps, reviewed.reps);
  assert.equal(after.due, reviewed.due);
});

test("reloading fills a missing breakdown and keeps review progress", () => {
  const store = createStore(memory());
  const card = store.add("endpoint", "我自己的註記", 1_700_000_000_000, {
    example: "This endpoint lists tickets.",
    breakdown: "   ",
  });
  assert.equal(card.breakdown, undefined);
  const reviewed = store.review(card.id, "good");
  const result = store.mergeSkipExisting([
    {
      id: "tech-002",
      front: "Endpoint",
      back: "端點",
      example: "A different sentence.",
      breakdown: "end + point → 末端 + 點",
      interval: 0,
      ease: 2.5,
      reps: 0,
      lapses: 9,
      due: 1,
    },
  ]);
  assert.equal(result.added, 0);
  assert.equal(result.filled, 1);
  const after = store.get(card.id);
  assert.equal(after.breakdown, "end + point → 末端 + 點");
  assert.equal(after.example, "This endpoint lists tickets.");
  assert.equal(after.back, "我自己的註記");
  assert.equal(after.interval, reviewed.interval);
  assert.equal(after.ease, reviewed.ease);
  assert.equal(after.reps, reviewed.reps);
  assert.equal(after.lapses, reviewed.lapses);
  assert.equal(after.due, reviewed.due);
  const second = store.mergeSkipExisting([
    { id: "tech-002", front: "endpoint", back: "端點", breakdown: "別的拆法" },
  ]);
  assert.equal(second.filled, 0);
  assert.equal(second.added, 0);
  assert.equal(store.get(card.id).breakdown, "end + point → 末端 + 點");
  assert.equal(store.get(card.id).interval, reviewed.interval);
});

test("corrupt storage is not overwritten by a new card", () => {
  const storage = memory();
  storage.setItem(STORAGE_KEY, "{not json");
  const store = createStore(storage);
  assert.equal(store.load().corrupt, true);
  assert.throws(() => store.add("apple", "蘋果"), (error) => error.code === "corrupt");
  assert.equal(storage.getItem(STORAGE_KEY), "{not json");
  store.reset();
  assert.equal(store.stats().total, 0);
});

test("import accepts the backup object or a bare array", () => {
  const cards = parseImport(JSON.stringify({ version: 1, cards: [{ front: "a", back: "b" }] }));
  assert.equal(cards.length, 1);
  assert.equal(parseImport(JSON.stringify([{ front: "a", back: "b" }])).length, 1);
  assert.throws(() => parseImport("nope"), (error) => error.code === "invalid-json");
  assert.throws(() => parseImport("{}"), (error) => error.code === "invalid-shape");
});

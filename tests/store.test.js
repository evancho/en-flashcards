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

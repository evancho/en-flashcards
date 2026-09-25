import assert from "node:assert/strict";
import test from "node:test";
import { buildCommuteQueue, commuteLines, readSettings, SETTINGS_KEY, shuffleInPlace, writeSettings } from "../js/review.js";

function memoryStorage(initial) {
  const mem = new Map(initial);
  return {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => mem.set(key, String(value)),
  };
}

test("review settings stay off a separate key from the cards", () => {
  const storage = memoryStorage();
  writeSettings(storage, { random: true, reverse: true, extra: "nope" });
  assert.deepEqual(readSettings(storage), { random: true, reverse: true });
  const saved = JSON.parse(storage.getItem(SETTINGS_KEY));
  assert.deepEqual(saved, { random: true, reverse: true });
  assert.equal(SETTINGS_KEY === "en-flashcards.v1", false);
});

test("broken settings fall back to english-first and due order", () => {
  const storage = memoryStorage([[SETTINGS_KEY, "{"]]);
  assert.deepEqual(readSettings(storage), { random: false, reverse: false });
  storage.setItem(SETTINGS_KEY, JSON.stringify({ random: "yes", reverse: 1 }));
  assert.deepEqual(readSettings(storage), { random: false, reverse: false });
  assert.deepEqual(readSettings(memoryStorage()), { random: false, reverse: false });
});

test("commute queue prefers due cards and can shuffle without touching them", () => {
  const now = 1_000;
  const later = { id: "later", front: "later", back: "後", due: now + 5, createdAt: 1, interval: 3, ease: 2.5 };
  const first = { id: "first", front: "apple", back: "蘋果", due: now, createdAt: 2, example: "An apple.", exampleZh: "一顆蘋果。" };
  const second = { id: "second", front: "berry", back: "莓", due: now, createdAt: 3 };
  const queue = buildCommuteQueue([later, second, first], now);
  assert.deepEqual(queue.map((card) => card.id), ["first", "second"]);
  assert.equal(later.interval, 3);
  const all = buildCommuteQueue([later], now);
  assert.deepEqual(all.map((card) => card.id), ["later"]);
  const shuffled = buildCommuteQueue([first, second], now, { random: true, randomFn: () => 0 });
  assert.deepEqual(shuffled.map((card) => card.id), ["second", "first"]);
  assert.deepEqual(
    commuteLines(first).map((line) => line.kind),
    ["front", "back", "example", "exampleZh"],
  );
  assert.deepEqual(
    commuteLines({ ...first, breakdown: "end + point → 末端 + 點" }).map((line) => line.kind),
    ["front", "back", "example", "exampleZh"],
  );
  assert.deepEqual(commuteLines({ front: "hi", back: "  ", example: "", exampleZh: "嗨" }).map((line) => line.text), ["hi", "嗨"]);
});

test("fisher-yates swaps with the injected random source", () => {
  const list = ["a", "b", "c", "d"];
  let calls = 0;
  shuffleInPlace(list, () => {
    calls += 1;
    return 0;
  });
  assert.equal(calls, 3);
  assert.deepEqual(list, ["b", "c", "d", "a"]);
  assert.deepEqual(shuffleInPlace(["only"]), ["only"]);
});

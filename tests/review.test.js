import assert from "node:assert/strict";
import test from "node:test";
import { readSettings, SETTINGS_KEY, shuffleInPlace, writeSettings } from "../js/review.js";

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

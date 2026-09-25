import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { findTermRanges } from "../js/highlight.js";

test("service worker precache lists real files", () => {
  const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const block = source.match(/const ASSETS = \[([\s\S]*?)\];/);
  assert.ok(block);
  const assets = [...block[1].matchAll(/"\.\/([^"]+)"/g)].map((match) => match[1]);
  assert.ok(assets.includes("index.html"));
  assert.ok(assets.includes("sw.js") === false);
  for (const asset of assets) {
    readFileSync(new URL(`../${asset}`, import.meta.url));
  }
});

test("page points at the manifest, stylesheet, script, and icons", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  for (const needle of [
    "manifest.webmanifest",
    "css/styles.css",
    "js/app.js",
    "icons/apple-touch-icon.png",
    "icons/icon-32.png",
    "不會",
    "有點生",
    "會了",
    "很熟",
    "從詞庫選一套",
  ]) {
    assert.ok(html.includes(needle), needle);
  }
  assert.equal(html.includes("載入科技英文 100 詞"), false);
  assert.equal(html.includes('id="load-deck"'), false);
  assert.equal(html.includes('id="empty-load-deck"'), false);
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /const DECK_CATALOG = "decks\/index\.json"/);
  assert.match(app, /載入／更新/);
  const loader = app.slice(app.indexOf("async function loadDeck"), app.indexOf("function addExamples"));
  assert.match(loader, /fetch\(path\)/);
  assert.match(loader, /mergeSkipExisting/);
  assert.doesNotMatch(loader, /replaceAll/);
  const catalog = JSON.parse(readFileSync(new URL("../decks/index.json", import.meta.url), "utf8"));
  assert.equal(catalog.decks.length, 1);
  assert.equal(catalog.decks[0].id, "tech-english-100");
  assert.equal(catalog.decks[0].path, "decks/tech-english-100.json");
  assert.equal(catalog.decks[0].title, "科技英文 100 詞");
  const deck = JSON.parse(readFileSync(new URL("../decks/tech-english-100.json", import.meta.url), "utf8"));
  assert.equal(deck.cards.length, 100);
  for (const card of deck.cards) {
    assert.equal(typeof card.example, "string", card.front);
    assert.ok(card.example.length >= 12, card.front);
    assert.equal(typeof card.exampleZh, "string", card.front);
    assert.ok(card.exampleZh.length >= 4, card.front);
    assert.equal(findTermRanges(card.example, card.front).length >= 1, true, card.front);
  }
  assert.match(html, /發音/);
  assert.match(html, /朗讀例句/);
  assert.equal(catalog.decks[0].count, deck.cards.length);
  assert.match(html, /版本 v4 · 詞庫列表/);
  const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(worker, /const CACHE = "en-flashcards-v4"/);
  assert.match(worker, /keys\.filter\(\(key\) => key !== CACHE\)/);
  assert.match(worker, /js\/speech\.js/);
  assert.match(worker, /js\/highlight\.js/);
  assert.equal(readFileSync(new URL("../js/store.js", import.meta.url), "utf8").includes('STORAGE_KEY = "en-flashcards.v1"'), true);
});

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
    "去詞庫選一套",
  ]) {
    assert.ok(html.includes(needle), needle);
  }
  assert.equal(html.includes("載入科技英文 100 詞"), false);
  assert.equal(html.includes('id="load-deck"'), false);
  assert.equal(html.includes('id="empty-load-deck"'), false);
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(html, /data-view="decks">詞庫/);
  assert.match(html, /data-view="list">單字/);
  const decks = html.slice(html.indexOf('id="view-decks"'), html.indexOf('id="view-backup"'));
  const backup = html.slice(html.indexOf('id="view-backup"'), html.indexOf("</main>"));
  assert.match(decks, /載入所選/);
  assert.match(decks, /全選/);
  assert.match(decks, /清除選取/);
  assert.match(decks, /id="deck-search"/);
  assert.match(decks, /id="deck-categories"/);
  assert.match(app, /沒有符合的詞庫/);
  assert.match(app, /function visibleDeckBoxes/);
  assert.equal(backup.includes("deck-list"), false);
  assert.equal(backup.includes("載入所選"), false);
  assert.equal(html.includes("載入／更新"), false);
  assert.match(app, /const DECK_CATALOG = "decks\/index\.json"/);
  assert.match(app, /載入所選/);
  assert.match(app, /if \(name === "decks"\) loadCatalog\(\)/);
  assert.match(app, /openView\("decks"\)/);
  assert.equal(app.includes("載入／更新"), false);
  const loader = app.slice(app.indexOf("async function loadSelectedDecks"), app.indexOf("function addExamples"));
  assert.match(loader, /fetch\(path\)/);
  assert.match(loader, /mergeSkipExisting/);
  assert.doesNotMatch(loader, /replaceAll/);
  const catalog = JSON.parse(readFileSync(new URL("../decks/index.json", import.meta.url), "utf8"));
  const expectedDecks = [
    ["tech-english-100", "科技英文 100 詞", "decks/tech-english-100.json", "科技"],
    ["daily-english-100", "生活用語 100", "decks/daily-english-100.json", "生活"],
    ["travel-english-100", "旅行用語 100", "decks/travel-english-100.json", "旅行"],
    ["business-english-100", "商業用語 100", "decks/business-english-100.json", "商業"],
  ];
  assert.equal(catalog.decks.length, expectedDecks.length);
  catalog.decks.forEach((entry, index) => {
    const [id, title, path, category] = expectedDecks[index];
    assert.equal(entry.id, id);
    assert.equal(entry.title, title);
    assert.equal(entry.path, path);
    assert.equal(entry.category, category);
    assert.equal(entry.count, 100);
    assert.equal(typeof entry.description, "string");
    assert.ok(entry.description.length >= 8, entry.id);
    const deck = JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
    assert.equal(deck.cards.length, 100, entry.id);
    const fronts = new Set();
    for (const card of deck.cards) {
      const key = card.front.toLowerCase();
      assert.equal(fronts.has(key), false, card.front);
      fronts.add(key);
      assert.equal(typeof card.example, "string", card.front);
      assert.ok(card.example.length >= 12, card.front);
      assert.equal(typeof card.exampleZh, "string", card.front);
      assert.ok(card.exampleZh.length >= 4, card.front);
      assert.equal(findTermRanges(card.example, card.front).length >= 1, true, `${card.front}: ${card.example}`);
    }
  });
  assert.match(html, /發音/);
  assert.match(html, /朗讀例句/);
  assert.match(html, /朗讀中文/);
  assert.match(html, /版本 v13 · 朗讀同一頁/);
  const reviewSpeak = html.slice(html.indexOf('id="review-speak"'), html.indexOf('id="ratings"'));
  assert.match(reviewSpeak, />單字</);
  assert.match(reviewSpeak, />例句</);
  assert.match(reviewSpeak, />中文</);
  assert.match(html, /id="card-breakdown"/);
  assert.match(html, /id="commute-breakdown"/);
  assert.match(html, /id="breakdown"/);
  const tech = catalog.decks.find((entry) => entry.id === "tech-english-100");
  const techDeck = JSON.parse(readFileSync(new URL(`../${tech.path}`, import.meta.url), "utf8"));
  const withParts = techDeck.cards.filter((card) => card.breakdown);
  assert.ok(withParts.length >= 55, `breakdown count ${withParts.length}`);
  const skipped = new Set(["API", "JSON", "bug", "algorithm", "Docker", "Kubernetes", "deploy", "proxy", "SLA"]);
  const present = new Set(["microservice", "malware", "encryption", "firewall", "endpoint"]);
  for (const card of techDeck.cards) {
    if (skipped.has(card.front)) assert.equal(card.breakdown, undefined, card.front);
    if (card.breakdown) {
      assert.ok(card.breakdown.includes("→"), card.front);
      assert.ok(card.breakdown.length <= 80, card.front);
      assert.equal(card.breakdown.includes("\n"), false, card.front);
    }
    if (present.has(card.front)) assert.equal(typeof card.breakdown, "string", card.front);
  }
  for (const entry of catalog.decks) {
    if (entry.id === "tech-english-100") continue;
    const deck = JSON.parse(readFileSync(new URL(`../${entry.path}`, import.meta.url), "utf8"));
    assert.equal(deck.cards.some((card) => card.breakdown), false, entry.id);
  }
  assert.match(html, /id="open-commute"/);
  const commuteView = html.slice(html.indexOf('id="view-commute"'), html.indexOf('id="view-add"'));
  assert.match(commuteView, /播放/);
  assert.match(commuteView, /下一張/);
  assert.match(commuteView, /上一張/);
  assert.match(commuteView, /結束/);
  const commuteCode = app.slice(app.indexOf("function prepareCommute"), app.indexOf("function renderBackup"));
  assert.match(commuteCode, /buildCommuteQueue/);
  assert.doesNotMatch(commuteCode, /store\.review/);
  assert.match(app, /speakChinese/);
  const review = html.slice(html.indexOf('id="view-review"'), html.indexOf('id="view-add"'));
  assert.match(review, /先英文/);
  assert.match(review, /先中文/);
  assert.match(review, /隨機順序/);
  assert.match(app, /shuffleInPlace/);
  assert.match(readFileSync(new URL("../js/review.js", import.meta.url), "utf8"), /en-flashcards\.settings/);
  const worker = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  assert.match(worker, /const CACHE = "en-flashcards-v13"/);
  assert.match(worker, /keys\.filter\(\(key\) => key !== CACHE\)/);
  assert.match(worker, /js\/speech\.js/);
  assert.match(worker, /js\/highlight\.js/);
  assert.match(worker, /js\/review\.js/);
  assert.equal(readFileSync(new URL("../js/store.js", import.meta.url), "utf8").includes('STORAGE_KEY = "en-flashcards.v1"'), true);
});

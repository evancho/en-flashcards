import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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
    "載入科技英文 100 詞",
  ]) {
    assert.ok(html.includes(needle), needle);
  }
  const app = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.match(app, /const STARTER_DECK = "decks\/tech-english-100\.json"/);
  const loader = app.slice(app.indexOf("async function loadStarterDeck"), app.indexOf("function addExamples"));
  assert.match(loader, /fetch\(STARTER_DECK\)/);
  assert.match(loader, /mergeSkipExisting/);
  assert.doesNotMatch(loader, /replaceAll/);
  const deck = JSON.parse(readFileSync(new URL("../decks/tech-english-100.json", import.meta.url), "utf8"));
  assert.equal(deck.cards.length, 100);
  for (const card of deck.cards) {
    assert.equal(typeof card.example, "string", card.front);
    assert.ok(card.example.length >= 12, card.front);
    const example = card.example.toLowerCase();
    const parts = card.front.toLowerCase().split(/\s*\/\s*/);
    assert.ok(parts.some((part) => example.includes(part)), `${card.front}: ${card.example}`);
  }
  assert.match(html, /發音/);
  assert.match(html, /朗讀例句/);
  assert.match(readFileSync(new URL("../sw.js", import.meta.url), "utf8"), /js\/speech\.js/);
});

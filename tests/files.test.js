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
  ]) {
    assert.ok(html.includes(needle), needle);
  }
});

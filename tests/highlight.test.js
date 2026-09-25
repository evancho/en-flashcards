import assert from "node:assert/strict";
import test from "node:test";
import { findTermRanges } from "../js/highlight.js";

function marked(text, term) {
  const ranges = findTermRanges(text, term);
  return ranges.map((range) => text.slice(range.start, range.end));
}

test("highlight keeps the sentence casing and skips words that only contain the term", () => {
  assert.deepEqual(marked("The mobile app calls an API to load your profile.", "API"), ["API"]);
  assert.deepEqual(marked("Open a pull request when the feature is ready.", "pull request"), ["pull request"]);
  assert.deepEqual(marked("CI/CD tests the app and deploys it after merge.", "CI/CD"), ["CI/CD"]);
  assert.deepEqual(marked("A/B testing picks the clearer signup form.", "A/B testing"), ["A/B testing"]);
  assert.deepEqual(marked("Keep each SDK key / API key on the server.", "SDK key / API key"), ["SDK key / API key"]);
  assert.deepEqual(marked("Debugging led us to a bad null check.", "bug"), []);
  assert.deepEqual(marked("Send the request, then read the request id.", "request"), ["request", "request"]);
  assert.deepEqual(marked("No example uses this phrase.", "webhook"), []);
});

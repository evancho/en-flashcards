import assert from "node:assert/strict";
import test from "node:test";
import { pickEnglishVoice } from "../js/speech.js";

test("prefers an en-US voice over other English voices", () => {
  const voice = pickEnglishVoice([
    { lang: "en-GB", name: "Daniel" },
    { lang: "zh-TW", name: "Meijia" },
    { lang: "en-US", name: "Alex" },
    { lang: "en-US", name: "Samantha" },
  ]);
  assert.equal(voice.name, "Samantha");
  assert.equal(pickEnglishVoice([{ lang: "en-GB", name: "Daniel" }]).lang, "en-GB");
  assert.equal(pickEnglishVoice([]), null);
});

import assert from "node:assert/strict";
import test from "node:test";
import { pickChineseVoice, pickEnglishVoice, speakChinese, speakEnglish } from "../js/speech.js";

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

test("prefers zh-TW for the Chinese gloss, then other Chinese voices", () => {
  const voice = pickChineseVoice([
    { lang: "en-US", name: "Samantha" },
    { lang: "zh-CN", name: "Ting-Ting" },
    { lang: "zh-TW", name: "Mei-Jia" },
  ]);
  assert.equal(voice.name, "Mei-Jia");
  assert.equal(pickChineseVoice([{ lang: "zh-HK", name: "Sin-Ji" }]).lang, "zh-HK");
  assert.equal(pickChineseVoice([{ lang: "zh-CN", name: "Ting-Ting" }]).lang, "zh-CN");
  assert.equal(pickChineseVoice([{ lang: "en-US", name: "Samantha" }]), null);
});

test("chinese and english speech cancel the previous utterance and keep plain text", () => {
  const spoken = [];
  globalThis.window = {
    speechSynthesis: {
      paused: false,
      getVoices: () => [
        { lang: "en-US", name: "Samantha" },
        { lang: "zh-TW", name: "Mei-Jia" },
      ],
      cancel() {
        spoken.push("cancel");
      },
      speak(utterance) {
        spoken.push(utterance);
      },
      resume() {},
    },
    SpeechSynthesisUtterance: class {
      constructor(text) {
        this.text = text;
      }
    },
  };
  try {
    assert.equal(speakEnglish("  The <b>API</b> returns JSON.  "), true);
    assert.equal(speakChinese("這個 API 回傳 JSON。"), true);
    assert.equal(spoken[0], "cancel");
    assert.equal(spoken[1].text, "The <b>API</b> returns JSON.");
    assert.equal(spoken[1].lang, "en-US");
    assert.equal(spoken[2], "cancel");
    assert.equal(spoken[3].text, "這個 API 回傳 JSON。");
    assert.equal(spoken[3].lang, "zh-TW");
    assert.equal(speakChinese("   "), false);
  } finally {
    delete globalThis.window;
  }
});

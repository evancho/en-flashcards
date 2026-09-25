export function speechAvailable() {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

export function pickEnglishVoice(voices) {
  const list = Array.isArray(voices) ? voices : [];
  const enUS = list.filter((voice) => /^en[-_]US$/i.test(voice?.lang || ""));
  const en = list.filter((voice) => /^en([-_]|$)/i.test(voice?.lang || ""));
  const preferred = (group) =>
    group.find((voice) => /samantha|siri|google|natural|premium|enhanced/i.test(voice?.name || "")) || group[0];
  return preferred(enUS) || preferred(en) || null;
}

export function pickChineseVoice(voices) {
  const list = Array.isArray(voices) ? voices : [];
  const match = (pattern) => list.filter((voice) => pattern.test(voice?.lang || ""));
  const preferred = (group) =>
    group.find((voice) => /mei[- ]?jia|ting[- ]?ting|sin[- ]?ji|siri|google|natural|premium|enhanced/i.test(voice?.name || "")) ||
    group[0];
  return (
    preferred(match(/^zh[-_](TW|Hant([-_]TW)?)$/i)) ||
    preferred(match(/^zh[-_]HK$/i)) ||
    preferred(match(/^zh([-_]|$)/i)) ||
    null
  );
}

let chosenEnglish = null;
let chosenChinese = null;

export function prepareVoices() {
  if (!speechAvailable()) return;
  const refresh = () => {
    const voices = window.speechSynthesis.getVoices();
    chosenEnglish = pickEnglishVoice(voices);
    chosenChinese = pickChineseVoice(voices);
  };
  refresh();
  window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
}

function speak(text, voice, fallbackLang) {
  if (!speechAvailable()) return false;
  const line = String(text ?? "").trim();
  if (!line) return false;
  const synth = window.speechSynthesis;
  const utterance = new window.SpeechSynthesisUtterance(line);
  utterance.lang = voice?.lang || fallbackLang;
  utterance.rate = 0.95;
  if (voice) utterance.voice = voice;
  try {
    if (synth.paused) synth.resume();
    synth.cancel();
    synth.speak(utterance);
  } catch {
    return false;
  }
  return true;
}

export function speakEnglish(text) {
  const voices = speechAvailable() ? window.speechSynthesis.getVoices() : [];
  const voice = chosenEnglish || pickEnglishVoice(voices);
  return speak(text, voice, "en-US");
}

export function speakChinese(text) {
  const voices = speechAvailable() ? window.speechSynthesis.getVoices() : [];
  const voice = chosenChinese || pickChineseVoice(voices);
  return speak(text, voice, "zh-TW");
}

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
let speakGeneration = 0;

export function stopSpeech() {
  speakGeneration += 1;
  if (!speechAvailable()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

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

function speak(text, voice, fallbackLang, onend) {
  if (!speechAvailable()) return false;
  const line = String(text ?? "").trim();
  if (!line) return false;
  const synth = window.speechSynthesis;
  const generation = ++speakGeneration;
  const utterance = new window.SpeechSynthesisUtterance(line);
  utterance.lang = voice?.lang || fallbackLang;
  utterance.rate = 0.95;
  if (voice) utterance.voice = voice;
  let settled = false;
  let timer = 0;
  const finish = () => {
    if (settled || generation !== speakGeneration) return;
    settled = true;
    clearTimeout(timer);
    onend?.();
  };
  if (onend) timer = setTimeout(finish, Math.min(25000, 2500 + line.length * 220));
  utterance.onend = finish;
  utterance.onerror = finish;
  const start = () => {
    if (generation !== speakGeneration) return;
    try {
      synth.speak(utterance);
    } catch {
      settled = true;
      clearTimeout(timer);
    }
  };
  try {
    if (synth.paused) synth.resume();
    const busy = Boolean(synth.speaking || synth.pending);
    synth.cancel();
    if (busy) setTimeout(start, 60);
    else start();
  } catch {
    clearTimeout(timer);
    return false;
  }
  return true;
}

function voiceFor(lang) {
  const voices = speechAvailable() ? window.speechSynthesis.getVoices() : [];
  if (lang === "zh") return { voice: chosenChinese || pickChineseVoice(voices), fallback: "zh-TW" };
  return { voice: chosenEnglish || pickEnglishVoice(voices), fallback: "en-US" };
}

export function speakEnglish(text) {
  const picked = voiceFor("en");
  return speak(text, picked.voice, picked.fallback);
}

export function speakChinese(text) {
  const picked = voiceFor("zh");
  return speak(text, picked.voice, picked.fallback);
}

export function speakHeard(text, lang, onend) {
  const picked = voiceFor(lang === "zh" ? "zh" : "en");
  return speak(text, picked.voice, picked.fallback, onend);
}

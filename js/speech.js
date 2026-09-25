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

let chosenVoice = null;

export function prepareVoices() {
  if (!speechAvailable()) return;
  const refresh = () => {
    chosenVoice = pickEnglishVoice(window.speechSynthesis.getVoices());
  };
  refresh();
  window.speechSynthesis.addEventListener?.("voiceschanged", refresh);
}

export function speakEnglish(text) {
  if (!speechAvailable()) return false;
  const line = String(text ?? "").trim();
  if (!line) return false;
  const synth = window.speechSynthesis;
  const utterance = new window.SpeechSynthesisUtterance(line);
  const voice = chosenVoice || pickEnglishVoice(synth.getVoices());
  utterance.lang = voice?.lang || "en-US";
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

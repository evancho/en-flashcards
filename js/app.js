import { createStore, parseImport } from "./store.js";
import { formatDelay, previewPlan, stageLabel, formatDue } from "./srs.js";
import { prepareVoices, speakEnglish, speechAvailable } from "./speech.js";

const TIP_KEY = "en-flashcards.ios-tip";
const EXAMPLES = [
  ["apple", "蘋果"],
  ["although", "雖然"],
  ["borrow", "借入"],
  ["decide", "決定"],
  ["quiet", "安靜的"],
];

const STARTER_DECK = "decks/tech-english-100.json";
const STARTER_LABEL = "載入科技英文 100 詞";

const store = createStore(localStorage);
const state = {
  view: "review",
  queue: [],
  current: null,
  revealed: false,
  editingId: null,
  toastTimer: 0,
  saving: false,
  loadingDeck: false,
};

const $ = (selector) => document.querySelector(selector);

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    el.hidden = true;
  }, 2400);
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function downloadText(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function explainError(error) {
  if (error?.code === "corrupt") return "資料讀不出來，已暫停寫入。";
  if (error?.code === "empty") return "請填寫英文和背面。";
  if (error?.code === "save-failed") return "存不進去。可先匯出備份。私密瀏覽有時不能存。";
  if (error?.code === "invalid-json" || error?.code === "invalid-shape") return "這不是詞卡備份。需要 JSON，且含有 cards 陣列。";
  return "沒有完成，請再試一次。";
}

let dialogResolver = null;

function ask({ title, body, okLabel = "確定", danger = false }) {
  const dialog = $("#dialog");
  $("#dialog-title").textContent = title;
  $("#dialog-body").textContent = body;
  const ok = $("#dialog-ok");
  ok.textContent = okLabel;
  ok.classList.toggle("danger", danger);
  dialog.hidden = false;
  $(".app").inert = true;
  (danger ? $("#dialog-cancel") : ok).focus();
  return new Promise((resolve) => {
    dialogResolver = resolve;
  });
}

function closeDialog(result) {
  $("#dialog").hidden = true;
  $(".app").inert = false;
  const resolve = dialogResolver;
  dialogResolver = null;
  resolve?.(result);
}

function refreshQueue() {
  const { cards, corrupt } = store.load();
  if (corrupt) {
    state.queue = [];
    state.current = null;
    state.revealed = false;
    return;
  }
  const byId = new Map(cards.map((card) => [card.id, card]));
  state.queue = state.queue.filter((card) => byId.has(card.id)).map((card) => byId.get(card.id));
  if (state.current) {
    if (byId.has(state.current.id)) state.current = byId.get(state.current.id);
    else {
      state.current = null;
      state.revealed = false;
    }
  }
  if (state.current) state.queue = state.queue.filter((card) => card.id !== state.current.id);
  const seen = new Set(state.queue.map((card) => card.id));
  if (state.current) seen.add(state.current.id);
  const now = Date.now();
  const extras = cards
    .filter((card) => card.due <= now && !seen.has(card.id))
    .sort((a, b) => a.due - b.due || a.createdAt - b.createdAt);
  state.queue.push(...extras);
  if (!state.current) {
    state.current = state.queue.shift() || null;
    state.revealed = false;
  }
}

function setRevealed(on) {
  state.revealed = on;
  const face = $("#card-face");
  $("#flashcard").classList.toggle("revealed", on);
  face.setAttribute("role", on ? "group" : "button");
  face.tabIndex = on ? -1 : 0;
  $("#card-back").hidden = !on;
  $("#card-prompt").hidden = on;
  $("#ratings").hidden = !on;
  $("#card-kicker").textContent = on ? "答案" : "英文";
  const example = state.current?.example || "";
  const exampleZh = state.current?.exampleZh || "";
  $("#example-block").hidden = !on || !example;
  $("#card-example").textContent = example;
  $("#card-example-zh").textContent = exampleZh;
  $("#card-example-zh").hidden = !exampleZh;
  const canSpeak = speechAvailable();
  $("#speak-front").hidden = !canSpeak;
  $("#speak-example").hidden = !canSpeak;
  $("#speech-note").hidden = canSpeak;
}

function renderChrome() {
  const stats = store.stats();
  $("#due-pill").textContent = `待複習 ${stats.due}`;
  const badge = $("#nav-due");
  badge.hidden = stats.due === 0;
  badge.textContent = String(stats.due);
  $("#corrupt").hidden = !stats.corrupt;
  document.querySelectorAll(".nav-btn").forEach((button) => {
    const view = button.dataset.view;
    const on = view === state.view || (state.view === "add" && state.editingId && view === "list");
    button.classList.toggle("active", on);
    button.setAttribute("aria-current", on ? "page" : "false");
  });
  for (const section of document.querySelectorAll(".view")) {
    section.hidden = section.id !== `view-${state.view}`;
  }
}

function renderReview() {
  const stats = store.stats();
  const wrap = $("#review-card-wrap");
  const empty = $("#review-empty");
  if (stats.corrupt || !state.current) {
    wrap.hidden = true;
    empty.hidden = false;
    $("#review-count").textContent = "";
    if (stats.corrupt) {
      $("#empty-title").textContent = "資料讀不出來";
      $("#empty-body").textContent = "先到備份下載原始資料，或清除後重來。";
      $("#empty-examples").hidden = true;
      $("#empty-load-deck").hidden = true;
      $("#empty-recheck").hidden = true;
      $("#empty-add").hidden = true;
      return;
    }
    const next = store.nextDue();
    if (stats.total === 0) {
      $("#empty-title").textContent = "還沒有單字";
      $("#empty-body").textContent = "加上英文和背面，就可以開始複習。";
      $("#empty-examples").hidden = false;
      $("#empty-load-deck").hidden = false;
      $("#empty-recheck").hidden = true;
      $("#empty-add").hidden = false;
    } else {
      $("#empty-title").textContent = "這輪沒有待複習的單字";
      $("#empty-body").textContent = next ? `下一張在 ${formatDelay(next - Date.now())}後` : "稍後再來看看。";
      $("#empty-examples").hidden = true;
      $("#empty-load-deck").hidden = true;
      $("#empty-recheck").hidden = false;
      $("#empty-add").hidden = false;
    }
    return;
  }

  wrap.hidden = false;
  empty.hidden = true;
  const left = state.queue.length + 1;
  $("#review-count").textContent = `這輪剩下 ${left} 張`;
  $("#card-front").textContent = state.current.front;
  $("#card-back").textContent = state.current.back;
  setRevealed(state.revealed);
  const plan = previewPlan(state.current, Date.now());
  for (const [rating, item] of Object.entries(plan)) {
    const slot = document.querySelector(`[data-delay="${rating}"]`);
    if (slot) slot.textContent = item.label;
  }
}

function renderForm() {
  const editing = Boolean(state.editingId);
  $("#form-title").textContent = editing ? "編輯單字" : "新增單字";
  $("#save-btn").textContent = editing ? "儲存修改" : "儲存";
  $("#edit-note").hidden = !editing;
  $("#cancel-edit").hidden = !editing;
  $("#delete-editing").hidden = !editing;
  const canSpeak = speechAvailable();
  $("#speak-form-front").hidden = !canSpeak;
  $("#speak-form-example").hidden = !canSpeak;
}

function renderList() {
  const { cards, corrupt } = store.load();
  const query = $("#search").value.trim().toLowerCase();
  const matched = cards
    .filter((card) => {
      if (!query) return true;
      return [card.front, card.back, card.example, card.exampleZh].some((value) =>
        String(value || "").toLowerCase().includes(query),
      );
    })
    .sort((a, b) => a.due - b.due || a.front.localeCompare(b.front));
  $("#list-count").textContent = corrupt ? "資料讀不出來" : `共 ${cards.length} 張，顯示 ${matched.length} 張`;
  const list = $("#card-list");
  list.replaceChildren();
  $("#list-empty").hidden = matched.length !== 0 || corrupt;
  const now = Date.now();
  for (const card of matched) {
    const row = document.createElement("article");
    row.className = "card-row";
    const title = document.createElement("h3");
    title.lang = "en";
    title.textContent = card.front;
    const head = document.createElement("div");
    head.className = "title-row";
    head.append(title);
    if (speechAvailable()) head.append(speakButton(card.front, "發音"));
    const back = document.createElement("p");
    back.className = "meaning-line";
    back.textContent = card.back;
    const meta = document.createElement("p");
    meta.className = card.due <= now ? "meta due" : "meta";
    meta.textContent = `${stageLabel(card)} · ${formatDue(card.due, now)}`;
    const actions = document.createElement("div");
    actions.className = "row";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn secondary";
    edit.dataset.edit = card.id;
    edit.textContent = "編輯";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn danger";
    remove.dataset.delete = card.id;
    remove.textContent = "刪除";
    actions.append(edit, remove);
    row.append(head, back);
    if (card.example) {
      const example = document.createElement("p");
      example.className = "example-line";
      example.lang = "en";
      example.textContent = card.example;
      row.append(example);
      if (card.exampleZh) {
        const gloss = document.createElement("p");
        gloss.className = "example-zh";
        gloss.textContent = card.exampleZh;
        row.append(gloss);
      }
      if (speechAvailable()) row.append(speakButton(card.example, "朗讀例句"));
    }
    row.append(meta, actions);
    list.append(row);
  }
}

function renderBackup() {
  const stats = store.stats();
  $("#stat-total").textContent = String(stats.total);
  $("#stat-due").textContent = String(stats.due);
}

function render() {
  renderChrome();
  if (state.view === "review") renderReview();
  if (state.view === "add") renderForm();
  if (state.view === "list") renderList();
  if (state.view === "backup") renderBackup();
}

function openView(name) {
  state.view = name;
  if (name === "review") refreshQueue();
  render();
  if (name === "add") $("#front").focus();
}

function resetForm() {
  state.editingId = null;
  $("#card-form").reset();
}

function exampleFields() {
  return { example: $("#example").value, exampleZh: $("#example-zh").value };
}

function fillForm(card) {
  $("#front").value = card.front;
  $("#back").value = card.back;
  $("#example").value = card.example || "";
  $("#example-zh").value = card.exampleZh || "";
}

function speakButton(text, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "speak";
  button.dataset.speak = text;
  button.textContent = label;
  return button;
}

function speakLine(text, { quiet = false } = {}) {
  const line = String(text ?? "").trim();
  if (!line) {
    if (!quiet) toast("沒有可以朗讀的英文。");
    return;
  }
  if (!speakEnglish(line) && !quiet) toast("這台裝置無法朗讀英文。");
}

function reveal() {
  if (!state.current || state.revealed) return;
  setRevealed(true);
  state.revealed = true;
  $("#ratings").querySelector("button")?.focus();
}

function revealAndSpeak() {
  if (!state.current || state.revealed) return;
  const word = state.current.front;
  reveal();
  speakLine(word, { quiet: true });
}

function rate(rating) {
  if (!state.current || !state.revealed) return;
  const id = state.current.id;
  let updated;
  try {
    updated = store.review(id, rating);
  } catch (error) {
    toast(explainError(error));
    render();
    return;
  }
  state.queue = state.queue.filter((card) => card.id !== id);
  state.current = null;
  state.revealed = false;
  if (rating === "again" && updated) {
    if (state.queue.length > 0) {
      state.queue.splice(Math.min(2, state.queue.length), 0, updated);
      toast("這張稍後再出現");
    } else {
      toast("約 1 分鐘後再練");
    }
  }
  refreshQueue();
  render();
}

function saveForm() {
  if (state.saving) return;
  const front = $("#front").value;
  const back = $("#back").value;
  if (!front.trim() || !back.trim()) {
    toast("請填寫英文和背面。");
    $(!front.trim() ? "#front" : "#back").focus();
    return;
  }
  state.saving = true;
  try {
    if (state.editingId) {
      store.updateText(state.editingId, front, back, Date.now(), exampleFields());
      toast("已儲存");
      const returnId = state.editingId;
      resetForm();
      openView("list");
      document.querySelector(`[data-edit="${CSS.escape(returnId)}"]`)?.focus();
    } else {
      const card = store.add(front, back, Date.now(), exampleFields());
      $("#card-form").reset();
      toast(`已加入「${card.front}」`);
      render();
      $("#front").focus();
    }
  } catch (error) {
    toast(explainError(error));
    render();
  } finally {
    state.saving = false;
  }
}

async function removeCard(id) {
  const card = store.get(id);
  if (!card) return;
  const ok = await ask({
    title: "刪除這張？",
    body: card.front,
    okLabel: "刪除",
    danger: true,
  });
  if (!ok) return;
  try {
    store.remove(id);
  } catch (error) {
    toast(explainError(error));
    return;
  }
  if (state.current?.id === id) {
    state.current = null;
    state.revealed = false;
  }
  state.queue = state.queue.filter((item) => item.id !== id);
  if (state.editingId === id) {
    resetForm();
    state.view = "list";
  }
  toast("已刪除");
  render();
}

async function loadStarterDeck() {
  if (state.loadingDeck) return;
  state.loadingDeck = true;
  const buttons = [...document.querySelectorAll("#load-deck, #empty-load-deck")];
  for (const button of buttons) {
    button.disabled = true;
    button.textContent = "載入中…";
  }
  try {
    let response;
    try {
      response = await fetch(STARTER_DECK);
    } catch {
      toast("請連上網路打開一次，才能載入這 100 詞。");
      return;
    }
    if (!response.ok) {
      toast("請連上網路打開一次，才能載入這 100 詞。");
      return;
    }
    let list;
    try {
      list = parseImport(await response.text());
    } catch {
      toast("這份詞庫讀不出來。");
      return;
    }
    const result = store.mergeSkipExisting(list);
    state.queue = [];
    state.current = null;
    state.revealed = false;
    if ((result.added > 0 || result.filled > 0) && state.view === "review") refreshQueue();
    if (result.added > 0 && result.filled > 0) toast(`已加入 ${result.added} 張，並補上 ${result.filled} 張例句`);
    else if (result.added > 0 && result.skipped > 0) toast(`已加入 ${result.added} 張，略過 ${result.skipped} 張已有的`);
    else if (result.added > 0) toast(`已加入 ${result.added} 張`);
    else if (result.filled > 0) toast(`已補上 ${result.filled} 張例句`);
    else toast("已加入 0 張，這些詞都已經在詞庫裡");
    render();
  } catch (error) {
    toast(explainError(error));
    render();
  } finally {
    state.loadingDeck = false;
    for (const button of buttons) {
      button.disabled = false;
      button.textContent = STARTER_LABEL;
    }
  }
}

function addExamples() {
  const now = Date.now();
  try {
    EXAMPLES.forEach(([front, back]) => store.add(front, back, now));
  } catch (error) {
    toast(explainError(error));
    return;
  }
  toast("已加入 5 張範例");
  state.queue = [];
  state.current = null;
  openView("review");
}

async function exportBackup() {
  const snapshot = store.load();
  if (snapshot.corrupt) {
    downloadText("en-flashcards-raw.txt", snapshot.raw || "", "text/plain");
    toast("已下載原始資料");
    return;
  }
  const text = JSON.stringify(store.exportPayload(), null, 2);
  const filename = `en-flashcards-${stamp()}.json`;
  const file = new File([text], filename, { type: "application/json" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "英文詞卡備份" });
      toast("已分享備份");
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  downloadText(filename, text);
  toast("已下載備份");
}

async function copyBackup() {
  const snapshot = store.load();
  const text = snapshot.corrupt ? snapshot.raw || "" : JSON.stringify(store.exportPayload(), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    toast("已複製備份文字");
  } catch {
    $("#import-text").value = text;
    openView("backup");
    $("#import-text").focus();
    $("#import-text").select();
    toast("請手動複製文字框裡的內容");
  }
}

async function importBackup(event) {
  event.preventDefault();
  const typed = $("#import-text").value.trim();
  const file = $("#import-file").files?.[0];
  let text = typed;
  try {
    if (!text && file) {
      if (file.size > 2_000_000) {
        toast("檔案太大");
        return;
      }
      text = await file.text();
    }
  } catch {
    toast("讀不到這個檔案");
    return;
  }
  if (!text) {
    toast("請選擇檔案或貼上 JSON");
    return;
  }
  let list;
  try {
    list = parseImport(text);
  } catch (error) {
    toast(explainError(error));
    return;
  }
  const mode = document.querySelector('input[name="import-mode"]:checked')?.value || "merge";
  if (mode === "replace") {
    const total = store.stats().total;
    const ok = await ask({
      title: "取代全部單字？",
      body: total ? `這台裝置上的 ${total} 張會被刪掉，改成檔案裡的內容。` : "會改成檔案裡的內容。",
      okLabel: "取代",
      danger: true,
    });
    if (!ok) return;
  }
  try {
    const result = mode === "replace" ? store.replaceAll(list) : store.merge(list);
    $("#import-text").value = "";
    $("#import-file").value = "";
    $("#file-name").textContent = "尚未選擇檔案";
    state.queue = [];
    state.current = null;
    state.revealed = false;
    toast(`已匯入。新增 ${result.added}、更新 ${result.updated}、略過 ${result.skipped}`);
    render();
  } catch (error) {
    toast(explainError(error));
    render();
  }
}

async function clearAll() {
  const total = store.stats().total;
  if (!total) {
    toast("目前沒有單字");
    return;
  }
  const ok = await ask({
    title: "清除全部單字？",
    body: `這台裝置上的 ${total} 張會刪掉。沒有備份的話找不回來。`,
    okLabel: "清除",
    danger: true,
  });
  if (!ok) return;
  try {
    store.reset();
  } catch (error) {
    toast(explainError(error));
    return;
  }
  state.queue = [];
  state.current = null;
  state.revealed = false;
  toast("已清除");
  render();
}

function showIosTip() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(TIP_KEY) === "1";
  } catch {
    dismissed = true;
  }
  $("#ios-tip").hidden = !ios || standalone || dismissed;
}

function registerServiceWorker() {
  const flag = $("#offline-flag");
  const missing = $("#offline-missing");
  if (!("serviceWorker" in navigator)) {
    missing.hidden = false;
    return;
  }
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) $("#update-banner").hidden = false;
  });
  navigator.serviceWorker
    .register("./sw.js", { scope: "./" })
    .then(() => navigator.serviceWorker.ready)
    .then(() => {
      flag.hidden = false;
    })
    .catch(() => {
      missing.hidden = false;
    });
}

function bind() {
  document.body.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton && !event.target.closest("#dialog")) {
      if (viewButton.dataset.view === "add") resetForm();
      openView(viewButton.dataset.view);
      return;
    }
    const edit = event.target.closest("[data-edit]");
    if (edit) {
      const card = store.get(edit.dataset.edit);
      if (!card) return;
      state.editingId = card.id;
      fillForm(card);
      openView("add");
      return;
    }
    const remove = event.target.closest("[data-delete]");
    if (remove) {
      removeCard(remove.dataset.delete);
    }
  });

  $("#flashcard").addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    revealAndSpeak();
  });
  $("#card-face").addEventListener("keydown", (event) => {
    if (state.revealed) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      revealAndSpeak();
    }
  });
  $("#speak-front").addEventListener("click", () => speakLine(state.current?.front));
  $("#speak-example").addEventListener("click", () => speakLine(state.current?.example));
  $("#speak-form-front").addEventListener("click", () => speakLine($("#front").value));
  $("#speak-form-example").addEventListener("click", () => speakLine($("#example").value));
  $("#card-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-speak]");
    if (!button) return;
    event.stopPropagation();
    speakLine(button.dataset.speak);
  });
  $("#ratings").addEventListener("click", (event) => {
    const button = event.target.closest("[data-rating]");
    if (button) rate(button.dataset.rating);
  });
  $("#card-form").addEventListener("submit", (event) => {
    event.preventDefault();
    saveForm();
  });
  $("#cancel-edit").addEventListener("click", () => {
    resetForm();
    openView("list");
  });
  $("#delete-editing").addEventListener("click", () => {
    if (state.editingId) removeCard(state.editingId);
  });
  $("#empty-add").addEventListener("click", () => {
    resetForm();
    openView("add");
  });
  $("#empty-examples").addEventListener("click", addExamples);
  $("#empty-load-deck").addEventListener("click", loadStarterDeck);
  $("#load-deck").addEventListener("click", loadStarterDeck);
  $("#empty-recheck").addEventListener("click", () => {
    state.queue = [];
    state.current = null;
    openView("review");
  });
  $("#search").addEventListener("input", () => renderList());
  $("#export-btn").addEventListener("click", exportBackup);
  $("#copy-btn").addEventListener("click", copyBackup);
  $("#export-raw").addEventListener("click", () => {
    const snapshot = store.load();
    downloadText("en-flashcards-raw.txt", snapshot.raw || "", "text/plain");
    toast("已下載原始資料");
  });
  $("#pick-file").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", () => {
    const file = $("#import-file").files?.[0];
    $("#file-name").textContent = file ? file.name : "尚未選擇檔案";
  });
  $("#import-form").addEventListener("submit", importBackup);
  $("#clear-all").addEventListener("click", clearAll);
  $("#reset-storage").addEventListener("click", async () => {
    const ok = await ask({
      title: "清除並重來？",
      body: "讀不出來的資料會從這台裝置移除。若還沒下載原始資料，就找不回來。",
      okLabel: "清除",
      danger: true,
    });
    if (!ok) return;
    try {
      store.reset();
      state.queue = [];
      state.current = null;
      toast("已清除");
      render();
    } catch (error) {
      toast(explainError(error));
    }
  });
  $("#dismiss-tip").addEventListener("click", () => {
    try {
      localStorage.setItem(TIP_KEY, "1");
    } catch {
      /* ignore */
    }
    $("#ios-tip").hidden = true;
  });
  $("#update-btn").addEventListener("click", () => location.reload());
  $("#dialog-cancel").addEventListener("click", () => closeDialog(false));
  $("#dialog-ok").addEventListener("click", () => closeDialog(true));
  $("#dialog").addEventListener("click", (event) => {
    if (event.target === $("#dialog")) closeDialog(false);
  });
  document.addEventListener("keydown", (event) => {
    if (!$("#dialog").hidden && event.key === "Escape") {
      event.preventDefault();
      closeDialog(false);
      return;
    }
    if (!$("#dialog").hidden || state.view !== "review" || event.target.closest("input, textarea")) return;
    if ((event.key === " " || event.key === "Enter") && !state.revealed && state.current && event.target.id !== "card-face") {
      if (event.target.closest("button")) return;
      event.preventDefault();
      revealAndSpeak();
    }
    if (!state.revealed) return;
    const map = { 1: "again", 2: "hard", 3: "good", 4: "easy" };
    if (map[event.key]) {
      event.preventDefault();
      rate(map[event.key]);
    }
  });
}

bind();
prepareVoices();
showIosTip();
openView("review");
registerServiceWorker();
setInterval(() => {
  if (state.view === "review" && !state.current) refreshQueue();
  render();
}, 15000);

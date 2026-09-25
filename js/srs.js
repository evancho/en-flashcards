const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const MAX_EASE = 3.5;
const MAX_INTERVAL = 365;

export const RATING_ORDER = ["again", "hard", "good", "easy"];

function clampEase(ease) {
  const rounded = Math.round(ease * 100) / 100;
  return Math.min(MAX_EASE, Math.max(MIN_EASE, rounded));
}

function grow(interval, factor, minAdd) {
  const scaled = Math.ceil(interval * factor - 1e-9);
  return Math.min(MAX_INTERVAL, Math.max(interval + minAdd, scaled, 1));
}

export function schedule(card, rating, now) {
  let ease = clampEase(card.ease ?? 2.5);
  let interval = card.interval ?? 0;
  let reps = card.reps ?? 0;
  let lapses = card.lapses ?? 0;
  let step = card.step ?? 0;
  let due = now;

  if (rating === "again") {
    if (interval > 0) lapses += 1;
    ease = clampEase(ease - 0.2);
    interval = 0;
    step = 0;
    reps = 0;
    due = now + MINUTE;
  } else if (rating === "hard") {
    ease = clampEase(ease - 0.15);
    if (interval === 0) {
      step = 1;
      due = now + 10 * MINUTE;
    } else {
      interval = grow(interval, 1.2, 0);
      step = 0;
      reps += 1;
      due = now + interval * DAY;
    }
  } else if (rating === "good") {
    if (interval === 0 && step === 0) {
      step = 1;
      due = now + 10 * MINUTE;
    } else if (interval === 0) {
      interval = 1;
      step = 0;
      reps += 1;
      due = now + DAY;
    } else {
      interval = grow(interval, ease, 1);
      step = 0;
      reps += 1;
      due = now + interval * DAY;
    }
  } else if (rating === "easy") {
    ease = clampEase(ease + 0.15);
    interval = interval === 0 ? 4 : grow(interval, (card.ease ?? 2.5) * 1.6, 1);
    step = 0;
    reps += 1;
    due = now + interval * DAY;
  } else {
    throw new Error(`unknown rating: ${rating}`);
  }

  return { ease, interval, reps, lapses, step, due };
}

export function formatDelay(ms) {
  const minute = MINUTE;
  const hour = 60 * minute;
  const day = DAY;
  if (ms < hour) return `${Math.max(1, Math.round(ms / minute))} 分鐘`;
  if (ms < day) return `${Math.max(1, Math.round(ms / hour))} 小時`;
  return `${Math.max(1, Math.round(ms / day))} 天`;
}

export function formatDue(due, now) {
  if (due <= now) return "待複習";
  return `${formatDelay(due - now)}後`;
}

export function stageLabel(card, now = Date.now()) {
  if ((card.interval ?? 0) > 0) return `間隔 ${card.interval} 天`;
  if ((card.lapses ?? 0) > 0 || (card.reps ?? 0) > 0 || (card.step ?? 0) > 0 || (card.due ?? 0) > now) {
    return "學習中";
  }
  return "新卡片";
}

export function previewPlan(card, now) {
  const plan = {};
  for (const rating of RATING_ORDER) {
    const next = schedule(card, rating, now);
    plan[rating] = { label: formatDelay(next.due - now), next };
  }
  return plan;
}

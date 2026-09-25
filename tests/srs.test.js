import assert from "node:assert/strict";
import test from "node:test";
import { formatDelay, previewPlan, schedule, stageLabel } from "../js/srs.js";

const now = 1_700_000_000_000;

function fresh(extra = {}) {
  return { ease: 2.5, interval: 0, reps: 0, lapses: 0, step: 0, due: now, ...extra };
}

test("new card buttons land on short steps or four days", () => {
  const plan = previewPlan(fresh(), now);
  assert.equal(plan.again.label, "1 分鐘");
  assert.equal(plan.hard.label, "10 分鐘");
  assert.equal(plan.good.label, "10 分鐘");
  assert.equal(plan.easy.label, "4 天");
  assert.equal(plan.again.next.lapses, 0);
  assert.equal(plan.easy.next.interval, 4);
  assert.equal(plan.easy.next.reps, 1);
});

test("good twice graduates a new card to one day", () => {
  const step = schedule(fresh(), "good", now);
  assert.equal(step.step, 1);
  assert.equal(step.interval, 0);
  const graduated = schedule(step, "good", now);
  assert.equal(graduated.interval, 1);
  assert.equal(graduated.reps, 1);
  assert.equal(graduated.due - now, 24 * 60 * 60 * 1000);
});

test("review ratings stretch by different amounts", () => {
  const card = fresh({ interval: 1, reps: 1 });
  assert.equal(schedule(card, "hard", now).interval, 2);
  assert.equal(schedule(card, "good", now).interval, 3);
  assert.equal(schedule(card, "easy", now).interval, 4);
  const again = schedule(card, "again", now);
  assert.equal(again.interval, 0);
  assert.equal(again.lapses, 1);
  assert.equal(again.reps, 0);
  assert.equal(again.ease, 2.3);
});

test("intervals stay within a year and ease stays in range", () => {
  const card = fresh({ interval: 200, reps: 8, ease: 2.5 });
  assert.equal(schedule(card, "good", now).interval, 365);
  assert.equal(schedule(fresh({ ease: 1.3, interval: 3 }), "again", now).ease, 1.3);
});

test("delay and stage labels", () => {
  assert.equal(formatDelay(60_000), "1 分鐘");
  assert.equal(formatDelay(10 * 60_000), "10 分鐘");
  assert.equal(formatDelay(4 * 24 * 60 * 60 * 1000), "4 天");
  assert.equal(stageLabel(fresh()), "新卡片");
  assert.equal(stageLabel(fresh({ step: 1 })), "學習中");
  assert.equal(stageLabel(fresh({ interval: 3 })), "間隔 3 天");
});

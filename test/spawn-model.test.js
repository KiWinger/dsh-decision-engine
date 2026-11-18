/**
 * 子代理模型阶梯的纯函数测试。
 *
 * 这一层的价值与 `spec.test.js` 相同：所有「档位怎么取、effort 怎么挑、
 * 哪条阶梯项算合法」都能脱离 DSH、脱离网络单独验证。派生一次真实子代理
 * 的成本是一个完整上下文，而这里每个用例都是微秒级。
 *
 * 运行：node --test test/
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  EFFORT_RANK,
  effortForScore,
  formatRoute,
  isRoute,
  orderEfforts,
  parseLadder,
  parseLadderEntry,
  sameRoute,
  tierForScore,
} from "../lib/spawn-model.js";

// ------------------------------------------------------------------ 阶梯解析

test("parseLadderEntry：接受 provider/model 与 provider/model/effort", () => {
  assert.deepEqual(parseLadderEntry("deepseek-official/deepseek-chat"), {
    provider: "deepseek-official",
    model: "deepseek-chat",
  });
  assert.deepEqual(parseLadderEntry("deepseek-official/deepseek-reasoner/max"), {
    provider: "deepseek-official",
    model: "deepseek-reasoner",
    effort: "max",
  });
});

test("parseLadderEntry：只按第一个斜杠切 provider，model 里允许带斜杠", () => {
  // 第三方聚合路由的 model id 常是 `vendor/model` 形态。provider id 由宿主
  // 用作路由键、不含 `/`，所以必须按第一个斜杠切。
  assert.deepEqual(parseLadderEntry("openrouter/meta-llama/llama-3-70b"), {
    provider: "openrouter",
    model: "meta-llama/llama-3-70b",
  });
});

test("parseLadderEntry：末尾是已知 effort 时才当强度", () => {
  // `provider/vendor/model` 与 `provider/model/effort` 语法同形，只能按语义判。
  assert.deepEqual(parseLadderEntry("openrouter/meta-llama/llama-3-70b/max"), {
    provider: "openrouter",
    model: "meta-llama/llama-3-70b",
    effort: "max",
  });
  // 不认识的尾段整段算 model，绝不拼一条不存在的路由。
  assert.deepEqual(parseLadderEntry("openrouter/vendor/model"), {
    provider: "openrouter",
    model: "vendor/model",
  });
  assert.deepEqual(parseLadderEntry("p/m/custom-effort"), { provider: "p", model: "m/custom-effort" });
});

test("parseLadderEntry：拒绝形状不合法的项", () => {
  for (const bad of ["", "   ", "no-slash", "/model", "provider/", "provider/   ", null, undefined, 42, {}]) {
    assert.equal(parseLadderEntry(bad), undefined, `应拒绝 ${JSON.stringify(bad)}`);
  }
});

test("parseLadderEntry：去掉首尾空白", () => {
  assert.deepEqual(parseLadderEntry("  p / m / low  "), { provider: "p", model: "m", effort: "low" });
});

test("parseLadder：逐条跳过非法项，不整表作废", () => {
  // 一条手写错误不该让整个功能静默失效，但也绝不能变成非法路由。
  const ladder = parseLadder(["p/a", "garbage", "p/b/high", "/x", "p/c"]);
  assert.deepEqual(
    ladder.map((entry) => formatRoute(entry)),
    ["p/a", "p/b", "p/c"],
  );
});

test("parseLadder：非数组输入返回空表", () => {
  for (const bad of [undefined, null, "p/a", 42, {}]) {
    assert.deepEqual(parseLadder(bad), []);
  }
});

test("parseLadder：顺序即配置顺序（从便宜到强）", () => {
  const ladder = parseLadder(["p/cheap", "p/mid", "p/strong"]);
  assert.deepEqual(ladder.map((entry) => entry.model), ["cheap", "mid", "strong"]);
});

// -------------------------------------------------------------------- 分档

test("tierForScore：等宽分档，1 落到最后一档", () => {
  const ladder = parseLadder(["p/a", "p/b", "p/c"]);
  assert.equal(tierForScore(ladder, 0).model, "a");
  assert.equal(tierForScore(ladder, 0.33).model, "a", "0.33×3=0.99 仍属第一档");
  assert.equal(tierForScore(ladder, 0.34).model, "b");
  assert.equal(tierForScore(ladder, 0.67).model, "c");
  // 1×3=3 越界，必须夹到最后一档而不是返回 undefined。
  assert.equal(tierForScore(ladder, 1).model, "c");
});

test("tierForScore：空阶梯返回 undefined（= 不介入）", () => {
  assert.equal(tierForScore([], 0.5), undefined);
  assert.equal(tierForScore(undefined, 0.5), undefined);
  assert.equal(tierForScore(null, 0.5), undefined);
});

test("tierForScore：畸形分数按 0 处理，绝不抛", () => {
  const ladder = parseLadder(["p/a", "p/b"]);
  for (const bad of [undefined, null, Number.NaN, "0.9", {}, Infinity]) {
    assert.equal(tierForScore(ladder, bad).model, "a", `${String(bad)} 应退到第一档`);
  }
});

test("tierForScore：单档阶梯永远取那一档", () => {
  const ladder = parseLadder(["only/one"]);
  assert.equal(tierForScore(ladder, 0).model, "one");
  assert.equal(tierForScore(ladder, 1).model, "one");
});

// ---------------------------------------------------------------- effort

test("orderEfforts：认识的 id 按强弱排序", () => {
  // 宿主适配器**不保证**公布顺序是升序；这里刻意打乱。
  const efforts = [{ id: "max" }, { id: "off" }, { id: "high" }, { id: "low" }];
  assert.deepEqual(
    orderEfforts(efforts).map((entry) => entry.id),
    ["off", "low", "high", "max"],
  );
});

test("orderEfforts：混进不认识的 id 时保留公布顺序", () => {
  // 混排会把不认识的 id 塞到某个猜测位置，而猜错的后果是「强度取反」。
  const efforts = [{ id: "max" }, { id: "experimental" }, { id: "off" }];
  assert.deepEqual(
    orderEfforts(efforts).map((entry) => entry.id),
    ["max", "experimental", "off"],
  );
});

test("orderEfforts：过滤畸形项，绝不抛", () => {
  const efforts = [null, { id: "" }, { id: "low" }, "high", { name: "no id" }, { id: "max" }];
  assert.deepEqual(
    orderEfforts(efforts).map((entry) => entry.id),
    ["low", "max"],
  );
  assert.deepEqual(orderEfforts(undefined), []);
  assert.deepEqual(orderEfforts("nope"), []);
});

test("effortForScore：按分数在排序后的清单里取档", () => {
  const efforts = [{ id: "max" }, { id: "off" }, { id: "high" }];
  // 排序后是 off / high / max。
  assert.equal(effortForScore(efforts, 0), "off");
  assert.equal(effortForScore(efforts, 0.5), "high");
  assert.equal(effortForScore(efforts, 1), "max");
});

test("effortForScore：模型不公布 effort 时返回 undefined（调用方必须省略该字段）", () => {
  // 这不是「随便给一个」的场景：硬塞一个不支持的 id 会让宿主抛
  // UNSUPPORTED_REASONING_EFFORT，子代理直接派生失败。
  assert.equal(effortForScore(undefined, 0.5), undefined);
  assert.equal(effortForScore([], 0.5), undefined);
  assert.equal(effortForScore([{ id: "" }], 0.5), undefined);
});

test("EFFORT_RANK 是弱到强，且 off 最弱", () => {
  assert.equal(EFFORT_RANK.off, 0);
  assert.ok(EFFORT_RANK.max > EFFORT_RANK.high);
  assert.ok(EFFORT_RANK.high > EFFORT_RANK.low);
});

// ------------------------------------------------------------------- 路由

test("sameRoute 不比较推理强度", () => {
  assert.equal(sameRoute({ provider: "p", model: "m" }, { provider: "p", model: "m", effort: "max" }), true);
  assert.equal(sameRoute({ provider: "p", model: "m" }, { provider: "p", model: "n" }), false);
  assert.equal(sameRoute({ provider: "p", model: "m" }, { provider: "q", model: "m" }), false);
});

test("sameRoute 拒绝畸形输入", () => {
  for (const bad of [null, undefined, "p/m", 42, {}, { provider: "p" }]) {
    assert.equal(sameRoute(bad, { provider: "p", model: "m" }), false, `左值 ${JSON.stringify(bad)}`);
    assert.equal(sameRoute({ provider: "p", model: "m" }, bad), false, `右值 ${JSON.stringify(bad)}`);
  }
});

test("isRoute：两个字段都必须是非空字符串", () => {
  assert.equal(isRoute({ provider: "p", model: "m" }), true);
  assert.equal(isRoute({ provider: "", model: "m" }), false);
  assert.equal(isRoute({ provider: "p", model: "" }), false);
  assert.equal(isRoute({ provider: "p" }), false);
  assert.equal(isRoute(undefined), false);
});

test("formatRoute：形状不合法时返回空串", () => {
  assert.equal(formatRoute({ provider: "p", model: "m" }), "p/m");
  assert.equal(formatRoute({ provider: "", model: "m" }), "");
  assert.equal(formatRoute(undefined), "");
});

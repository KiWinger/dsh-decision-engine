/**
 * 子代理模型候选与 effort 映射的纯函数测试。
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
  candidateRoutes,
  effortForScore,
  formatRoute,
  isRoute,
  orderEfforts,
  routeCriteria,
  routeFromChoice,
  routeKey,
  sameRoute,
} from "../lib/spawn-model.js";

// ---------------------------------------------------------------- 候选规整

test("candidateRoutes：去重、丢弃非法项、保持顺序", () => {
  const routes = candidateRoutes([
    { provider: "a", model: "m1" },
    { provider: "a", model: "m1" },
    { provider: "b", model: "m2" },
    { provider: "", model: "m3" },
    null,
    "a/m4",
    { provider: "c", model: "" },
  ]);
  assert.deepEqual(routes, [
    { provider: "a", model: "m1" },
    { provider: "b", model: "m2" },
  ]);
});

test("candidateRoutes：遵守上限，且上限之前的顺序就是出题顺序", () => {
  const many = Array.from({ length: 30 }, (_, index) => ({ provider: "p", model: `m${index}` }));
  const routes = candidateRoutes(many, 5);
  assert.equal(routes.length, 5);
  assert.deepEqual(routes.map((r) => r.model), ["m0", "m1", "m2", "m3", "m4"]);
});

test("candidateRoutes：畸形输入返回空表", () => {
  for (const bad of [undefined, null, "p/m", 42, {}]) {
    assert.deepEqual(candidateRoutes(bad), []);
  }
});

// ------------------------------------------------------------------- choice

test("routeKey：稳定短 id，与路由文本无关", () => {
  assert.equal(routeKey(0), "r0");
  assert.equal(routeKey(7), "r7");
  // 畸形下标退到 r0，绝不产生非法 key。
  assert.equal(routeKey(-1), "r0");
  assert.equal(routeKey(Number.NaN), "r0");
});

test("routeCriteria：键是短 id，值是可读路由，并标出 lead 当前路由", () => {
  const routes = candidateRoutes([
    { provider: "cheap", model: "flash" },
    { provider: "strong", model: "pro" },
  ]);
  const criteria = routeCriteria(routes, { provider: "strong", model: "pro" });
  assert.deepEqual(Object.keys(criteria), ["r0", "r1"]);
  assert.equal(criteria.r0, "cheap/flash");
  assert.equal(criteria.r1, "strong/pro (the lead's current route)");
});

test("routeCriteria：没有当前路由时不加标注", () => {
  const routes = candidateRoutes([{ provider: "a", model: "m" }]);
  assert.equal(routeCriteria(routes, undefined).r0, "a/m");
});

test("routeCriteria：空候选返回空对象", () => {
  assert.deepEqual(routeCriteria([], undefined), {});
});

test("routeFromChoice：把短 id 还原成真实路由", () => {
  const routes = candidateRoutes([
    { provider: "a", model: "m1" },
    { provider: "b", model: "m2" },
  ]);
  assert.deepEqual(routeFromChoice("r0", routes), { provider: "a", model: "m1" });
  assert.deepEqual(routeFromChoice("r1", routes), { provider: "b", model: "m2" });
});

test("routeFromChoice：越界或畸形键返回 undefined（绝不猜一条路由）", () => {
  const routes = candidateRoutes([{ provider: "a", model: "m" }]);
  for (const bad of ["r1", "r-1", "r", "a/m", "", null, undefined, 3, "r01x"]) {
    assert.equal(routeFromChoice(bad, routes), undefined, `应拒绝 ${JSON.stringify(bad)}`);
  }
});

test("路由文本带斜杠也不会破坏映射（这正是用短 id 的理由）", () => {
  // 第三方聚合路由的 model id 常含 `/`；若拿路由文本当 choice 键，端点会把
  // 它当路径或截断。短 id 让键与文本彻底解耦。
  const routes = candidateRoutes([{ provider: "openrouter", model: "meta-llama/llama-3-70b" }]);
  const criteria = routeCriteria(routes, undefined);
  assert.deepEqual(Object.keys(criteria), ["r0"]);
  assert.equal(criteria.r0, "openrouter/meta-llama/llama-3-70b");
  assert.deepEqual(routeFromChoice("r0", routes), { provider: "openrouter", model: "meta-llama/llama-3-70b" });
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

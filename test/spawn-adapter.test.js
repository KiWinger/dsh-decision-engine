/**
 * 子代理模型的**接线行为**测试：优先级、边界、降级。
 *
 * 为什么这一层必须单独测：这条链路的正确性几乎全在「什么时候不介入」上。
 * 三类不介入（lead 显式指定 / 阶梯为空 / 决策模型降级）都不会抛错，只会
 * 表现为「子代理用了和 lead 一样的模型」——从外部看与「插件正常工作但判定
 * 该继承」完全一样。因此这里对着**是否调用了 select** 断言，而不是对着
 * 最终路由断言。
 *
 * 运行：node --test test/
 */

import test from "node:test";
import assert from "node:assert/strict";

import { mountSpawnPoint } from "../lib/adapters/spawn.js";
import { forgetSpawnOverride, mountSpawnModelTools } from "../lib/spawn-model-tools.js";

/** 造一个尽量照宿主形状的 ctx：记录监听器、可注入服务。 */
function makeCtx(services = {}) {
  const hooks = new Map();
  return {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    on(name, listener) {
      const list = hooks.get(name) ?? [];
      list.push(listener);
      hooks.set(name, list);
      return () => {};
    },
    get(name) {
      return services[name];
    },
    listeners(name) {
      return hooks.get(name) ?? [];
    },
  };
}

/**
 * 造一个宿主形状的 agent。
 *
 * @param options - `{ sessionId, parentSession, provider, model, origin }`。
 */
function makeAgent({ sessionId, parentSession, provider = "lead-prov", model = "lead-model", origin = "subagent" } = {}) {
  const selected = [];
  return {
    options: { provider, model },
    session: {
      id: sessionId,
      header: {
        ...(parentSession === undefined ? {} : { parentSession }),
        ...(origin === undefined ? {} : { origin }),
        delegationDepth: 1,
      },
      requestHeader: () => undefined,
    },
    model: {
      current: () => ({ provider, model }),
      select: (selection) => selected.push(selection),
    },
    selected,
  };
}

/** 造一个 runner：`ask` 的结果由调用方给定，其余按真实语义实现。 */
function makeRunner({ mode = "enforce", answer } = {}) {
  const asked = [];
  return {
    asked,
    participates: () => mode === "observe" || mode === "enforce",
    enforces: () => mode === "enforce",
    async ask(id, input) {
      asked.push({ id, input });
      return typeof answer === "function" ? answer(id, input) : answer;
    },
  };
}

const telemetry = { log() {}, noteAdapterError() {} };
const digestRecent = () => "";

/** 一个会公布 effort 清单的假 llm。 */
function makeLlm(efforts = [{ id: "off" }, { id: "low" }, { id: "high" }, { id: "max" }]) {
  const resolved = [];
  return {
    resolved,
    listProviders: () => [{ id: "lead-prov", name: "Lead" }, { id: "cheap", name: "Cheap" }],
    async listModels(provider) {
      // 枚举两档模型，让「退回适配器枚举」那条测试有东西可选。
      return [
        { provider, id: `${provider}-model-a`, name: "A" },
        { provider, id: `${provider}-model-b`, name: "B" },
      ];
    },
    async resolveModelInfo(provider, model) {
      resolved.push(`${provider}/${model}`);
      return { provider, model, name: model, reasoning: efforts.length === 0 ? undefined : { efforts } };
    },
  };
}

const CFG = {
  spawnModelMaxCandidates: 12,
  spawnModelTools: ["subagent", "subagent_fork"],
  spawnModelTaskChars: 1600,
  recentMessages: 4,
  recentMessageChars: 240,
};

/** 宿主授权的两条子代理路由（= 真实部署里 `allowedModels` 的样子）。 */
const POLICY = [
  { provider: "cheap", model: "cheap-model" },
  { provider: "lead-prov", model: "lead-model" },
];

/**
 * 造一个带宿主授权策略的父会话。
 *
 * 策略是宿主自己写进会话日志的 log-only 事件；这里照真实形状塞一条，
 * 因为「候选从宿主授权清单来」正是本次改造的核心。
 */
function withPolicy(session, allowedModels = POLICY) {
  session.snapshotEvents = () => [
    { type: "subagent/model-selection-policy", data: { allowedModels } },
  ];
  return session;
}

/** 一个会公布 effort 清单的假 llm。 */

/**
 * 一条「选中这条路由」的裁决。
 *
 * 按显式路由写而不是按候选下标：候选顺序由 `withCurrent` 决定（lead 当前
 * 路由永远排第一），用下标会让测试依赖那个顺序，读起来也不清楚选了什么。
 */
const pick = (provider = "cheap", model = "cheap-model", depth = 0.1) => ({
  mode: "enforce",
  action: { kind: "switch", provider, model, depth, reason: "test" },
});

/** 挂好适配器并返回两个监听器入口。 */
function mount({ cfg = CFG, runner, llm, services = {} } = {}) {
  const ctx = makeCtx({ llm, agents: services.agents, ...services });
  const mounted = mountSpawnPoint(ctx, {
    runner,
    getConfig: () => cfg,
    telemetry,
    digestRecent,
  });
  return {
    ctx,
    mounted,
    preExecute: ctx.listeners("tools/pre-execute")[0],
    created: ctx.listeners("agent/created")[0],
    disposed: ctx.listeners("agent/disposed")[0],
  };
}

/** 造一次子代理工具调用。 */
function subagentExec(agent, args = {}) {
  return {
    name: "subagent",
    agent,
    signal: undefined,
    arguments: { prompt: "调研 dsh 的 subagent 生命周期", description: "research", ...args },
  };
}

const allow = async () => ({ kind: "allow" });

// ------------------------------------------------------------------ 主路径

test("主路径：决策模型选中候选 → 子代理 select 到那条路由", async () => {
  const lead = makeAgent({ sessionId: "lead-1", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ answer: pick() });
  const llm = makeLlm();
  const { preExecute, created } = mount({ runner, llm });

  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 1, "应问一次决策模型");
  assert.equal(runner.asked[0].id, "spawnModel");

  const child = makeAgent({ sessionId: "child-1", parentSession: "lead-1", provider: "lead-prov", model: "lead-model" });
  created({ agent: child });

  assert.equal(child.selected.length, 1, "应调用一次 select");
  assert.deepEqual(child.selected[0], { provider: "cheap", model: "cheap-model", reasoningEffort: "off" });
});

test("主路径：候选来自宿主授权清单，用户无需为本插件配置路由", async () => {
  const lead = makeAgent({ sessionId: "lead-2", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ answer: pick() });
  const { preExecute } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead, { prompt: "把这个模块的测试补齐" }), allow);
  const input = runner.asked[0].input;
  assert.equal(input.task, "把这个模块的测试补齐");
  assert.equal(input.description, "research");
  // 候选来自宿主那条策略；lead 当前路由被提到最前（保证「继承」永远是选项）。
  assert.deepEqual(input.routes, [
    { provider: "lead-prov", model: "lead-model" },
    { provider: "cheap", model: "cheap-model" },
  ]);
  assert.deepEqual(input.current, { provider: "lead-prov", model: "lead-model" });
});

test("主路径：没有授权策略时退回适配器枚举", async () => {
  const lead = makeAgent({ sessionId: "lead-2b", origin: undefined });
  // 刻意不给 session 塞策略事件。
  const runner = makeRunner({ answer: pick() });
  const llm = makeLlm();
  const { preExecute } = mount({ runner, llm });

  await preExecute(subagentExec(lead), allow);
  const input = runner.asked[0].input;
  // 枚举来自 listProviders × listModels，且 lead 当前路由排在最前。
  assert.equal(input.routes[0].provider, "lead-prov", "lead 当前路由必须排第一");
  assert.ok(input.routes.length > 2, "应枚举出多条真实路由");
});

test("主路径：宿主与适配器都没有信息时，至少保留「继承」这一个选项", async () => {
  const lead = makeAgent({ sessionId: "lead-2c", origin: undefined });
  const runner = makeRunner({ answer: pick() });
  const llm = {
    listProviders: () => [],
    listModels: async () => [],
    resolveModelInfo: async (provider, model) => ({ provider, model, name: model }),
  };
  const { preExecute } = mount({ runner, llm });

  await preExecute(subagentExec(lead), allow);
  // 候选只有 lead 当前路由 → 没有可选项，压根不该问（见「不介入」那一条）。
  assert.equal(runner.asked.length, 0);
});

test("主路径：effort 按目标模型公布的清单取，而不是猜", async () => {
  const lead = makeAgent({ sessionId: "lead-3", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ answer: pick("cheap", "cheap-model", 1) });
  const llm = makeLlm();
  const { preExecute, created } = mount({ runner, llm });

  await preExecute(subagentExec(lead), allow);
  assert.deepEqual(llm.resolved, ["cheap/cheap-model"], "必须查目标模型的元数据");

  const child = makeAgent({ sessionId: "child-3", parentSession: "lead-3" });
  created({ agent: child });
  // depth=1 → 最后一档。
  assert.equal(child.selected[0].reasoningEffort, "max");
});

test("主路径：目标模型不公布 effort 时省略该字段", async () => {
  const lead = makeAgent({ sessionId: "lead-4", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ answer: pick() });
  const llm = makeLlm([]);
  const { preExecute, created } = mount({ runner, llm });

  await preExecute(subagentExec(lead), allow);
  const child = makeAgent({ sessionId: "child-4", parentSession: "lead-4" });
  created({ agent: child });
  // 硬塞一个不支持的 id 会让宿主抛 UNSUPPORTED_REASONING_EFFORT。
  assert.deepEqual(child.selected[0], { provider: "cheap", model: "cheap-model" });
  assert.equal("reasoningEffort" in child.selected[0], false);
});

test("主路径：模型选中 lead 当前路由时不 select（那是「继承」，无需动作）", async () => {
  const lead = makeAgent({ sessionId: "lead-4b", origin: undefined });
  withPolicy(lead.session);
  // 选第二个候选 = lead 自己那条。
  const runner = makeRunner({ answer: pick("lead-prov", "lead-model") });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 1, "该问还是要问——模型有权决定继承");

  const child = makeAgent({ sessionId: "child-4b", parentSession: "lead-4b", provider: "lead-prov", model: "lead-model" });
  created({ agent: child });
  assert.equal(child.selected.length, 0, "选中当前路由 = 不改");
});

// ------------------------------------------------------------ 三类不介入

test("不介入：lead 在派生调用里显式给了 provider/model", async () => {
  const lead = makeAgent({ sessionId: "lead-6", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ answer: pick() });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead, { provider: "explicit", model: "chosen" }), allow);
  assert.equal(runner.asked.length, 0, "显式选择优先，根本不该问决策模型");

  const child = makeAgent({ sessionId: "child-6", parentSession: "lead-6" });
  created({ agent: child });
  assert.equal(child.selected.length, 0);
});

test("不介入：候选只有 lead 当前路由（没有可选项）", async () => {
  const lead = makeAgent({ sessionId: "lead-7", origin: undefined });
  // 策略里只有 lead 自己那条。
  withPolicy(lead.session, [{ provider: "lead-prov", model: "lead-model" }]);
  const runner = makeRunner({ answer: pick() });
  const { preExecute } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 0, "问了也只会答「继承」，纯浪费");
});

test("不介入：决策点模式为 off", async () => {
  const lead = makeAgent({ sessionId: "lead-8", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ mode: "off", answer: pick() });
  const { preExecute } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 0);
});

test("不介入：不是子代理工具（普通 bash 调用零开销）", async () => {
  const lead = makeAgent({ sessionId: "lead-9", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ answer: pick() });
  const { preExecute } = mount({ runner, llm: makeLlm() });

  await preExecute({ ...subagentExec(lead), name: "bash" }, allow);
  assert.equal(runner.asked.length, 0);
});

test("不介入：prompt 为空", async () => {
  const lead = makeAgent({ sessionId: "lead-10", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ answer: pick() });
  const { preExecute } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead, { prompt: "   " }), allow);
  assert.equal(runner.asked.length, 0);
});

test("不介入：裁决是 keep", async () => {
  const lead = makeAgent({ sessionId: "lead-11", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ answer: { mode: "enforce", action: { kind: "keep", reason: "inherit" } } });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  const child = makeAgent({ sessionId: "child-11", parentSession: "lead-11" });
  created({ agent: child });
  assert.equal(child.selected.length, 0, "keep = 沿用 lead，不 select");
});

test("不介入：决策模型降级（无 action）", async () => {
  const lead = makeAgent({ sessionId: "lead-12", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ answer: { mode: "enforce", degraded: "timeout" } });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  const child = makeAgent({ sessionId: "child-12", parentSession: "lead-12" });
  created({ agent: child });
  assert.equal(child.selected.length, 0, "降级必须 fail-open");
});

test("不介入：查不到目标模型的元数据（不赌未确认的路由）", async () => {
  const lead = makeAgent({ sessionId: "lead-13", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ answer: pick() });
  const llm = {
    listProviders: () => [],
    listModels: async () => [],
    resolveModelInfo: async () => {
      throw new Error("unknown provider");
    },
  };
  const { preExecute, created } = mount({ runner, llm });

  await preExecute(subagentExec(lead), allow);
  const child = makeAgent({ sessionId: "child-13", parentSession: "lead-13" });
  created({ agent: child });
  assert.equal(child.selected.length, 0);
});

test("不介入：llm 服务缺失的宿主", async () => {
  const lead = makeAgent({ sessionId: "lead-14", origin: undefined });
  withPolicy(lead.session);
  const runner = makeRunner({ answer: pick() });
  const { preExecute } = mount({ runner, llm: undefined });

  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 0, "没有 llm 就无从判断档位合法性");
});

// ------------------------------------------------------------- observe 模式

test("observe 模式：问了、记了，但不改路由", async () => {
  const lead = makeAgent({ sessionId: "lead-15", origin: undefined });
  const runner = makeRunner({ mode: "observe", answer: pick() });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 1, "观察模式也要问（否则无从记录本该怎样）");

  const child = makeAgent({ sessionId: "child-15", parentSession: "lead-15" });
  created({ agent: child });
  assert.equal(child.selected.length, 0, "观察模式绝不改变行为");
});

// --------------------------------------------------------------- 显式覆盖

test("set_model 覆盖：优先级高于决策模型", async () => {
  const lead = makeAgent({ sessionId: "lead-16", origin: undefined });
  // 让决策模型给一个不同的答案，确认它根本没被问。
  const runner = makeRunner({ answer: pick() });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });

  // 走 set_model 工具的 execute 写入，而不是直接改模块内部表：
  // 这样测试覆盖的是「模型真的调用这个工具」那条真实路径。
  const registered = [];
  const tools = { register: (def) => { registered.push(def); return () => {}; } };
  mountSpawnModelTools(
    {
      get: (name) => (name === "tools" ? tools : name === "llm" ? makeLlm() : undefined),
      effect: (body) => body(),
      logger: { info() {}, warn() {} },
    },
    { getConfig: () => CFG },
  );
  const setModel = registered.find((def) => def.name === "set_model");
  await setModel.execute({ provider: "cheap", model: "cheap-model", reasoning_effort: "high" }, { agent: lead });

  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 0, "显式覆盖生效时不该问决策模型");

  const child = makeAgent({ sessionId: "child-16", parentSession: "lead-16" });
  created({ agent: child });
  assert.deepEqual(child.selected[0], { provider: "cheap", model: "cheap-model", reasoningEffort: "high" });

  forgetSpawnOverride("lead-16");
});

test("set_model 覆盖：clear 之后回到自动判断", async () => {
  const lead = makeAgent({ sessionId: "lead-17", origin: undefined });
  const registered = [];
  const tools = { register: (def) => { registered.push(def); return () => {}; } };
  mountSpawnModelTools(
    {
      get: (name) => (name === "tools" ? tools : name === "llm" ? makeLlm() : undefined),
      effect: (body) => body(),
      logger: { info() {}, warn() {} },
    },
    { getConfig: () => CFG },
  );
  const setModel = registered.find((def) => def.name === "set_model");
  await setModel.execute({ provider: "cheap", model: "cheap-model" }, { agent: lead });
  await setModel.execute({ clear: true }, { agent: lead });

  const runner = makeRunner({ answer: pick() });
  const { preExecute } = mount({ runner, llm: makeLlm() });
  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 1, "清掉覆盖后应回到自动判断");
});

// --------------------------------------------------------------- 队列语义

test("队列：并行派生按 description 配对，不靠到达顺序", async () => {
  // 宿主并发执行 create，`agent/created` 的到达顺序与工具调用顺序无关。
  // 两次派生拿到不同档位时，按 label 配对才不会串。
  const lead = makeAgent({ sessionId: "lead-18c", origin: undefined });
  withPolicy(lead.session);
  // 不给策略，让 llm 枚举出多条不同路由，两次 pick 不同模型。
  lead.session.snapshotEvents = () => [];
  let call = 0;
  const runner = makeRunner({
    answer: () => {
      call += 1;
      // 两次选不同模型，都不是 lead 当前路由。
      return call === 1 ? pick("cheap", "cheap-model-a") : pick("cheap", "cheap-model-b");
    },
  });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead, { description: "research" }), allow);
  await preExecute(subagentExec(lead, { description: "refactor" }), allow);

  // 故意让「refactor」（第二次派生的）先到达。
  const refactor = makeAgent({ sessionId: "child-18d", parentSession: "lead-18c" });
  refactor.session.snapshotEvents = () => [{ type: "subagent/descriptor", data: { label: "refactor" } }];
  created({ agent: refactor });

  const research = makeAgent({ sessionId: "child-18e", parentSession: "lead-18c" });
  research.session.snapshotEvents = () => [{ type: "subagent/descriptor", data: { label: "research" } }];
  created({ agent: research });

  assert.equal(refactor.selected[0].model, "cheap-model-b", "refactor 应拿到自己的选择");
  assert.equal(research.selected[0].model, "cheap-model-a", "research 应拿到自己的选择");
});

test("队列：并行的两次派生各取各的档位", async () => {
  const lead = makeAgent({ sessionId: "lead-18", origin: undefined });
  const runner = makeRunner({ answer: pick() });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  await preExecute(subagentExec(lead), allow);

  const first = makeAgent({ sessionId: "child-18a", parentSession: "lead-18" });
  const second = makeAgent({ sessionId: "child-18b", parentSession: "lead-18" });
  created({ agent: first });
  created({ agent: second });

  assert.equal(first.selected.length, 1);
  assert.equal(second.selected.length, 1);
  assert.deepEqual(first.selected[0], second.selected[0], "同一档位两次派生应一致");
});

test("队列：没有待判记录的子代理原样继承（workflow / agent team 自起的）", async () => {
  const lead = makeAgent({ sessionId: "lead-19", origin: undefined });
  const runner = makeRunner({ answer: pick() });
  const { created } = mount({ runner, llm: makeLlm() });

  const stranger = makeAgent({ sessionId: "child-19", parentSession: "someone-else" });
  created({ agent: stranger });
  assert.equal(stranger.selected.length, 0, "拿不到记录就绝不猜");
});

test("队列：无父会话的子代理（lead 自己）完全不碰", async () => {
  const runner = makeRunner({ answer: pick() });
  const { created } = mount({ runner, llm: makeLlm() });

  const lead = makeAgent({ sessionId: "lead-20", parentSession: undefined });
  created({ agent: lead });
  assert.equal(lead.selected.length, 0);
});

test("队列：销毁会话时清掉待判条目，不会漏给下一个同名会话", async () => {
  const lead = makeAgent({ sessionId: "lead-21", origin: undefined });
  const runner = makeRunner({ answer: pick() });
  const { preExecute, created, disposed } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  disposed({ agent: lead });

  const child = makeAgent({ sessionId: "child-21", parentSession: "lead-21" });
  created({ agent: child });
  assert.equal(child.selected.length, 0, "销毁后不该再有待判记录");
});

test("队列：set_model 覆盖与当前路由相同且无 effort 时不 select", async () => {
  const lead = makeAgent({ sessionId: "lead-22", origin: undefined });
  withPolicy(lead.session);
  const registered = [];
  const tools = { register: (def) => { registered.push(def); return () => {}; } };
  mountSpawnModelTools(
    { get: (n) => (n === "tools" ? tools : n === "llm" ? makeLlm() : undefined), effect: (b) => b(), logger: { info() {}, warn() {} } },
    { getConfig: () => CFG },
  );
  const setModel = registered.find((def) => def.name === "set_model");
  // 覆盖为与 lead 相同的路由，不带 effort。
  await setModel.execute({ provider: "lead-prov", model: "lead-model" }, { agent: lead });

  const runner = makeRunner({ answer: pick("lead-prov", "lead-model") });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });
  await preExecute(subagentExec(lead), allow);

  const child = makeAgent({ sessionId: "child-22", parentSession: "lead-22", provider: "lead-prov", model: "lead-model" });
  created({ agent: child });
  assert.equal(child.selected.length, 0, "同路由同强度不必 select");
});

test("队列：set_model 覆盖与当前路由相同但带不同 effort 时仍 select", async () => {
  const lead = makeAgent({ sessionId: "lead-23", origin: undefined });
  withPolicy(lead.session);
  const registered = [];
  const tools = { register: (def) => { registered.push(def); return () => {}; } };
  mountSpawnModelTools(
    { get: (n) => (n === "tools" ? tools : n === "llm" ? makeLlm() : undefined), effect: (b) => b(), logger: { info() {}, warn() {} } },
    { getConfig: () => CFG },
  );
  const setModel = registered.find((def) => def.name === "set_model");
  // 同路由，但显式指定了 max 强度。
  await setModel.execute({ provider: "lead-prov", model: "lead-model", reasoning_effort: "max" }, { agent: lead });

  const runner = makeRunner({ answer: pick("lead-prov", "lead-model") });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });
  await preExecute(subagentExec(lead), allow);

  const child = makeAgent({ sessionId: "child-23", parentSession: "lead-23", provider: "lead-prov", model: "lead-model" });
  created({ agent: child });
  assert.deepEqual(child.selected[0], { provider: "lead-prov", model: "lead-model", reasoningEffort: "max" });
});

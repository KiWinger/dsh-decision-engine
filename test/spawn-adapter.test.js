/**
 * 子代理模型阶梯的**接线行为**测试：优先级、边界、降级。
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

/** 一条完整的「切到便宜档」裁决。 */
const switchTo = (capability = 0.1, depth = 0.1) => ({
  mode: "enforce",
  action: { kind: "switch", capability, depth, reason: "test" },
});

/** 一个会公布 effort 清单的假 llm。 */
function makeLlm(efforts = [{ id: "off" }, { id: "low" }, { id: "high" }, { id: "max" }]) {
  const resolved = [];
  return {
    resolved,
    listProviders: () => [{ id: "lead-prov", name: "Lead" }, { id: "cheap", name: "Cheap" }],
    async listModels() {
      return [];
    },
    async resolveModelInfo(provider, model) {
      resolved.push(`${provider}/${model}`);
      return { provider, model, name: model, reasoning: efforts.length === 0 ? undefined : { efforts } };
    },
  };
}

const CFG = {
  spawnModelLadder: ["cheap/cheap-model", "lead-prov/lead-model"],
  spawnModelTools: ["subagent", "subagent_fork"],
  spawnModelMaxScore: 0.4,
  spawnModelFidelityFloor: 0.6,
  spawnModelTaskChars: 1600,
  recentMessages: 4,
  recentMessageChars: 240,
};

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

test("主路径：判出 switch → 子代理 select 到阶梯档位", async () => {
  const lead = makeAgent({ sessionId: "lead-1", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
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

test("主路径：state 里带任务正文、阶梯与父路由", async () => {
  const lead = makeAgent({ sessionId: "lead-2", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
  const { preExecute } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead, { prompt: "把这个模块的测试补齐" }), allow);
  const state = runner.asked[0].input;
  assert.equal(state.task, "把这个模块的测试补齐");
  assert.equal(state.description, "research");
  assert.deepEqual(state.ladder, ["cheap/cheap-model", "lead-prov/lead-model"]);
  assert.equal(state.parent, "lead-prov/lead-model");
});

test("主路径：effort 按目标模型公布的清单取，而不是猜", async () => {
  const lead = makeAgent({ sessionId: "lead-3", origin: undefined });
  const runner = makeRunner({ answer: switchTo(0.1, 1) });
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
  const runner = makeRunner({ answer: switchTo() });
  const llm = makeLlm([]);
  const { preExecute, created } = mount({ runner, llm });

  await preExecute(subagentExec(lead), allow);
  const child = makeAgent({ sessionId: "child-4", parentSession: "lead-4" });
  created({ agent: child });
  // 硬塞一个不支持的 id 会让宿主抛 UNSUPPORTED_REASONING_EFFORT。
  assert.deepEqual(child.selected[0], { provider: "cheap", model: "cheap-model" });
  assert.equal("reasoningEffort" in child.selected[0], false);
});

test("主路径：阶梯项自带 effort 时优先，且不去查模型元数据", async () => {
  const cfg = { ...CFG, spawnModelLadder: ["cheap/cheap-model/high"] };
  const lead = makeAgent({ sessionId: "lead-5", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
  const llm = makeLlm();
  const { preExecute, created } = mount({ cfg, runner, llm });

  await preExecute(subagentExec(lead), allow);
  assert.deepEqual(llm.resolved, [], "写了显式 effort 就不必查元数据");

  const child = makeAgent({ sessionId: "child-5", parentSession: "lead-5" });
  created({ agent: child });
  assert.equal(child.selected[0].reasoningEffort, "high");
});

// ------------------------------------------------------------ 三类不介入

test("不介入：lead 在派生调用里显式给了 provider/model", async () => {
  const lead = makeAgent({ sessionId: "lead-6", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead, { provider: "explicit", model: "chosen" }), allow);
  assert.equal(runner.asked.length, 0, "显式选择优先，根本不该问决策模型");

  const child = makeAgent({ sessionId: "child-6", parentSession: "lead-6" });
  created({ agent: child });
  assert.equal(child.selected.length, 0);
});

test("不介入：阶梯为空（默认配置，升级后行为不变）", async () => {
  const cfg = { ...CFG, spawnModelLadder: [] };
  const lead = makeAgent({ sessionId: "lead-7", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
  const { preExecute } = mount({ cfg, runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 0, "没有目标可下沉就不该问");
});

test("不介入：决策点模式为 off", async () => {
  const lead = makeAgent({ sessionId: "lead-8", origin: undefined });
  const runner = makeRunner({ mode: "off", answer: switchTo() });
  const { preExecute } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 0);
});

test("不介入：不是子代理工具（普通 bash 调用零开销）", async () => {
  const lead = makeAgent({ sessionId: "lead-9", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
  const { preExecute } = mount({ runner, llm: makeLlm() });

  await preExecute({ ...subagentExec(lead), name: "bash" }, allow);
  assert.equal(runner.asked.length, 0);
});

test("不介入：prompt 为空", async () => {
  const lead = makeAgent({ sessionId: "lead-10", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
  const { preExecute } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead, { prompt: "   " }), allow);
  assert.equal(runner.asked.length, 0);
});

test("不介入：裁决是 keep（保真否决 / 能力超线）", async () => {
  const lead = makeAgent({ sessionId: "lead-11", origin: undefined });
  const runner = makeRunner({ answer: { mode: "enforce", action: { kind: "keep", reason: "high fidelity" } } });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  const child = makeAgent({ sessionId: "child-11", parentSession: "lead-11" });
  created({ agent: child });
  assert.equal(child.selected.length, 0, "keep = 沿用 lead，不 select");
});

test("不介入：决策模型降级（无 action）", async () => {
  const lead = makeAgent({ sessionId: "lead-12", origin: undefined });
  const runner = makeRunner({ answer: { mode: "enforce", degraded: "timeout" } });
  const { preExecute, created } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  const child = makeAgent({ sessionId: "child-12", parentSession: "lead-12" });
  created({ agent: child });
  assert.equal(child.selected.length, 0, "降级必须 fail-open");
});

test("不介入：查不到目标模型的元数据（不赌未确认的路由）", async () => {
  const lead = makeAgent({ sessionId: "lead-13", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
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
  const runner = makeRunner({ answer: switchTo() });
  const { preExecute } = mount({ runner, llm: undefined });

  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 0, "没有 llm 就无从判断档位合法性");
});

// ------------------------------------------------------------- observe 模式

test("observe 模式：问了、记了，但不改路由", async () => {
  const lead = makeAgent({ sessionId: "lead-15", origin: undefined });
  const runner = makeRunner({ mode: "observe", answer: switchTo() });
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
  const runner = makeRunner({ answer: switchTo() });
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

  const runner = makeRunner({ answer: switchTo() });
  const { preExecute } = mount({ runner, llm: makeLlm() });
  await preExecute(subagentExec(lead), allow);
  assert.equal(runner.asked.length, 1, "清掉覆盖后应回到自动判断");
});

// --------------------------------------------------------------- 队列语义

test("队列：并行派生按 description 配对，不靠到达顺序", async () => {
  // 宿主并发执行 create，`agent/created` 的到达顺序与工具调用顺序无关。
  // 两次派生拿到不同档位时，按 label 配对才不会串。
  const cfg = { ...CFG, spawnModelLadder: ["cheap/cheap-model", "lead-prov/lead-model"] };
  const lead = makeAgent({ sessionId: "lead-18c", origin: undefined });
  // 第一次判「便宜档」（capability 低），第二次判「强档」（capability 高）。
  let call = 0;
  const runner = makeRunner({
    answer: () => {
      call += 1;
      return switchTo(call === 1 ? 0 : 0.99);
    },
  });
  const { preExecute, created } = mount({ cfg, runner, llm: makeLlm() });

  await preExecute(subagentExec(lead, { description: "research" }), allow);
  await preExecute(subagentExec(lead, { description: "refactor" }), allow);

  // 故意让「refactor」（第二次派生的）先到达。
  const refactor = makeAgent({ sessionId: "child-18d", parentSession: "lead-18c" });
  refactor.session.snapshotEvents = () => [{ type: "subagent/descriptor", data: { label: "refactor" } }];
  created({ agent: refactor });

  const research = makeAgent({ sessionId: "child-18e", parentSession: "lead-18c" });
  research.session.snapshotEvents = () => [{ type: "subagent/descriptor", data: { label: "research" } }];
  created({ agent: research });

  assert.equal(refactor.selected[0].model, "lead-model", "refactor 应拿到强档");
  assert.equal(research.selected[0].model, "cheap-model", "research 应拿到便宜档");
});

test("队列：并行的两次派生各取各的档位", async () => {
  const lead = makeAgent({ sessionId: "lead-18", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
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
  const runner = makeRunner({ answer: switchTo() });
  const { created } = mount({ runner, llm: makeLlm() });

  const stranger = makeAgent({ sessionId: "child-19", parentSession: "someone-else" });
  created({ agent: stranger });
  assert.equal(stranger.selected.length, 0, "拿不到记录就绝不猜");
});

test("队列：无父会话的子代理（lead 自己）完全不碰", async () => {
  const runner = makeRunner({ answer: switchTo() });
  const { created } = mount({ runner, llm: makeLlm() });

  const lead = makeAgent({ sessionId: "lead-20", parentSession: undefined });
  created({ agent: lead });
  assert.equal(lead.selected.length, 0);
});

test("队列：销毁会话时清掉待判条目，不会漏给下一个同名会话", async () => {
  const lead = makeAgent({ sessionId: "lead-21", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
  const { preExecute, created, disposed } = mount({ runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  disposed({ agent: lead });

  const child = makeAgent({ sessionId: "child-21", parentSession: "lead-21" });
  created({ agent: child });
  assert.equal(child.selected.length, 0, "销毁后不该再有待判记录");
});

test("队列：路由与强度都没变时不 select（避免无意义写入）", async () => {
  // 子代理已经用 lead 的路由 + 同一个强度：这次 select 只会多写一条
  // `model/selection`，不改变任何实际行为。
  const cfg = { ...CFG, spawnModelLadder: ["lead-prov/lead-model/off"] };
  const lead = makeAgent({ sessionId: "lead-22", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
  const { preExecute, created } = mount({ cfg, runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  const child = makeAgent({ sessionId: "child-22", parentSession: "lead-22", provider: "lead-prov", model: "lead-model" });
  child.options.reasoningEffort = "off";
  created({ agent: child });
  assert.equal(child.selected.length, 0, "同路由同强度不必 select");
});

test("队列：同路由但强度不同时仍要 select（那是真实的强度变更）", async () => {
  // 宿主的「模型已切换」提示只在 provider/model 变化时出现（effort-only
  // 变更不提示），所以这一档 select 没有副作用，却是真实的强度变更。
  const cfg = { ...CFG, spawnModelLadder: ["lead-prov/lead-model/max"] };
  const lead = makeAgent({ sessionId: "lead-23", origin: undefined });
  const runner = makeRunner({ answer: switchTo() });
  const { preExecute, created } = mount({ cfg, runner, llm: makeLlm() });

  await preExecute(subagentExec(lead), allow);
  const child = makeAgent({ sessionId: "child-23", parentSession: "lead-23", provider: "lead-prov", model: "lead-model" });
  child.options.reasoningEffort = "off";
  created({ agent: child });
  assert.deepEqual(child.selected[0], { provider: "lead-prov", model: "lead-model", reasoningEffort: "max" });
});

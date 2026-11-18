/**
 * 子代理模型 —— 适配器。
 *
 * ## 它取代的是什么
 *
 * 宿主派生 subagent 时原样继承 lead 的 provider / model / 推理强度
 * （`resolveChildAgentOptions` → `parentAgentOptionsForDelegation`）。本适配器
 * 让**决策模型自己挑**：候选来自宿主已经确认可用的路由，模型选一个，插件在
 * 子代理首次请求前把选择落地。
 *
 * ## 为什么是两个钩子
 *
 * 宿主的派生时序是固定的，而两个「可能有用」的时刻各自缺一半信息：
 *
 *   tools/pre-execute（subagent 调用）
 *     ✓ 拿得到**完整任务**（`arguments.prompt`）
 *     ✗ 子代理还不存在，没有任何对象可以改路由
 *
 *   agent/created（子代理创建完成、首步尚未开始）
 *     ✓ 子代理已经存在，`agent.model.select()` 立刻生效
 *     ✗ 载荷里只有 `agent` 与 `source`，拿不到任务内容
 *
 * 所以拆成两段，用一条待判队列接起来：pre-execute 判断并入队，agent/created
 * 取走并落地。
 *
 * **必须落在 `agent/created`，不能拖到 `agent/pre-step`**：循环是在**派发
 * pre-step 之前**捕获本步 selection 的（`preStep()` 第一行就是
 * `model.current()`），所以在 pre-step 里 select 只能影响**下一步**。对只跑
 * 一两步的子代理来说，那等于永远不生效。
 *
 * ## 候选从哪来（都不需要用户为本插件配置）
 *
 *   1. 宿主会话的 `subagent/model-selection-policy` 事件里的 `allowedModels`
 *      —— 用户已经在 DSH 设置里配好的、明确授权给子代理的路由；
 *   2. 没有该策略时，退回 `llm.listProviders()` × `llm.listModels()`；
 *   3. 都没有时，至少包含 lead 当前路由（这样模型永远有「继承」这个选项）。
 *
 * ## 三道不介入的边界
 *
 *   1. lead 在派生调用里显式给了 provider/model —— 显式选择永远优先；
 *   2. 候选里只有一条且就是 lead 当前路由 —— 没有可选项，问了也白问；
 *   3. 决策模型判 keep 或降级 —— 插件的判断是优化，不是正确性的必要条件。
 *
 * @module dsh-decision-engine/adapters/spawn
 */

import { candidateRoutes, effortForScore, isRoute, sameRoute } from "../spawn-model.js";
import { forgetSpawnOverride, spawnOverrideOf } from "../spawn-model-tools.js";
import { sessionEventsOf } from "../session-events.js";

/** 待判队列的存活上限：超过这个时间的条目视为「那次派生没成功」。 */
const PENDING_TTL_MS = 120_000;

/**
 * 挂载子代理模型决策。
 *
 * @param ctx - cordis 插件上下文。
 * @param deps - 运行期依赖。
 * @returns `{ mounted }`。
 */
export function mountSpawnPoint(ctx, deps) {
  const { runner, getConfig, telemetry } = deps;

  /**
   * 待判队列：父会话 id → 待应用的档位数组。
   *
   * 用数组而不是单个值：lead 可以在一条消息里并行派生多个子代理，每个都有
   * 自己的 prompt 与自己的选择。按入队顺序取走，条数天然对齐。
   */
  const pending = new Map();

  /** 记一条待应用的选择。 */
  const push = (parentId, entry) => {
    const list = pending.get(parentId);
    if (list === undefined) pending.set(parentId, [entry]);
    else list.push(entry);
  };

  /**
   * 取走一条待应用的选择（顺手清掉过期条目）。
   *
   * 优先按 `label`（子代理会话里持久化的 description）精确配对，配不上才
   * 退回 FIFO。为什么需要精确配对：lead 可以在一条消息里并行派生多个子代理，
   * 而宿主的 create 是并发执行的——`agent/created` 的到达顺序与工具调用的
   * 发起顺序**不保证一致**。纯 FIFO 在那种情况下会把 A 的选择发给 B。
   *
   * @param parentId - 父会话 id。
   * @param label - 子代理的 description（可能是空串）。
   * @returns 选择记录，或 undefined。
   */
  const take = (parentId, label) => {
    const list = pending.get(parentId);
    if (list === undefined) return undefined;
    const now = Date.now();
    while (list.length > 0 && now - list[0].at > PENDING_TTL_MS) list.shift();
    if (list.length === 0) {
      pending.delete(parentId);
      return undefined;
    }
    let index = 0;
    if (typeof label === "string" && label.length > 0) {
      const matched = list.findIndex((entry) => entry.label === label);
      if (matched >= 0) index = matched;
    }
    const [entry] = list.splice(index, 1);
    if (list.length === 0) pending.delete(parentId);
    return entry;
  };

  // -------------------------------------------------------- tools/pre-execute
  /**
   * 在一次子代理派生**发出之前**做判断。
   *
   * 这里刻意用 `runner.ask` 而不是自己发请求：超时、冷却、答案校验、遥测、
   * 决策明细全部走同一条链路，与其余决策点完全一致。降级时 `ask` 返回没有
   * `action`，于是什么都不入队，子代理原样继承——这就是 fail-open。
   */
  const preExecute = async (exec, next) => {
    try {
      if (exec?.agent === undefined) return next();

      const cfg = getConfig();
      const tools = Array.isArray(cfg.spawnModelTools) ? cfg.spawnModelTools : [];
      if (!tools.includes(exec.name)) return next();

      const args = exec.arguments ?? {};
      const parent = exec.agent;
      const parentId = parent.session?.id;
      if (typeof parentId !== "string") return next();

      // lead 在派生调用里显式给了路由 → 宿主会把它写进子代理 options。
      // 这是优先级最高的一层（模型在工具参数上的直接选择），本插件完全不介入。
      if (isRoute({ provider: args.provider, model: args.model })) return next();

      // ---- 显式路：lead 用 set_model 指定过 -------------------------------
      //
      // 刻意**不看**决策点的模式：`set_model` 是模型主动调用的工具，它的
      // 效果不该取决于「自动判断」那个开关是 off 还是 enforce。两条路各自
      // 独立，显式选择永远优先。
      const override = spawnOverrideOf(parentId);
      if (override !== undefined) {
        push(parentId, {
          at: Date.now(),
          provider: override.provider,
          model: override.model,
          ...override.effort === undefined ? {} : { effort: override.effort },
          label: typeof args.description === "string" ? args.description : "",
          source: "set_model",
          enforced: true,
        });
        return next();
      }

      // ---- 自动路：决策模型挑选 -------------------------------------------
      if (!runner.participates("spawnModel")) return next();

      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
      // 没有 prompt 就没什么可判断的（子代理工具的两个必填参数之一）。
      if (prompt.length === 0) return next();

      const llm = ctx.get?.("llm");
      if (llm === undefined) return next();

      const current = currentRoute(parent);
      const routes = await collectCandidates(ctx, parent, current, cfg);
      // 只有一条且就是 lead 当前路由 → 没有可选项。问一次模型再放弃是纯浪费
      // （与 route 点「下沉目标没配就不判断」同一条规矩）。
      if (routes.length === 0) return next();
      if (routes.length === 1 && sameRoute(routes[0], current)) return next();

      const result = await runner.ask(
        "spawnModel",
        {
          task: prompt.slice(0, Math.max(200, cfg.spawnModelTaskChars ?? 1600)),
          description: typeof args.description === "string" ? args.description : "",
          depth: typeof parent.session?.header?.delegationDepth === "number"
            ? parent.session.header.delegationDepth + 1
            : 1,
          routes,
          current,
          recent: deps.digestRecent(parent.session, cfg.recentMessages, cfg.recentMessageChars),
        },
        // session 只给「决策历史」明细用，不参与裁决。
        { signal: exec.signal, session: parent.session },
      );

      if (result.action?.kind !== "switch") return next();
      const provider = result.action.provider;
      const model = result.action.model;
      if (typeof provider !== "string" || typeof model !== "string") return next();

      // 选中的是 lead 当前路由 = 模型说「继承就好」。不入队、不 select：
      // 那只会多写一条 model/selection 并让会话里凭空出现一条「模型已切换」的
      // 提示。spec 层也有同样的判断，但这里再做一次——即使将来 spec 改了，
      // 这层防御也不会让无意义的 select 发生。
      if (isRoute(current) && provider === current.provider && model === current.model) return next();

      // 推理强度按目标模型**实际公布**的清单取；取不到就省略该字段。
      // 硬塞一个该模型不支持的 id 会让宿主抛 UNSUPPORTED_REASONING_EFFORT，
      // 子代理直接派生失败——那比「用错强度」贵得多。
      let effort;
      try {
        const info = await llm.resolveModelInfo(provider, model, exec.signal);
        effort = effortForScore(info?.reasoning?.efforts, result.action.depth);
      } catch {
        // 查不到元数据 = 这条路由可能压根不可用。不赌，原样继承。
        ctx.logger?.warn?.(
          `dsh-decision-engine: 无法确认 ${provider}/${model} 的模型信息，子代理沿用 lead 的路由`,
        );
        return next();
      }

      push(parentId, {
        at: Date.now(),
        provider,
        model,
        ...effort === undefined ? {} : { effort },
        // 用派生的 description 当匹配键：并行派生时 FIFO 顺序并不等于
        // 子代理的创建顺序（宿主的 create 是并发进行的），按 label 配对
        // 才能保证每个子代理拿到自己那次的选择。
        label: typeof args.description === "string" ? args.description : "",
        source: "decision",
        reason: result.action.reason,
        enforced: runner.enforces("spawnModel"),
      });
    } catch (error) {
      telemetry.noteAdapterError("spawnModel", error, ctx);
    }
    return next();
  };

  ctx.on("tools/pre-execute", preExecute);

  // -------------------------------------------------------------- agent/created
  /**
   * 在子代理首步开始**之前**应用选择。
   *
   * `agent/created` 是串行（serial）事件：它返回之后 `ctx.agents.create()` 才
   * 返回，子代理 manager 才把首条 prompt 投进 inbox。所以在这一刻 select 改的
   * 是「第一次请求」用的路由，而不是「下一次」。
   */
  const created = (payload) => {
    try {
      const agent = payload?.agent;
      const session = agent?.session;
      if (session === undefined) return;

      const parentId = session.header?.parentSession;
      if (typeof parentId !== "string") return;

      const entry = take(parentId, descriptorLabel(session));
      if (entry === undefined) return;

      // observe 只记录（明细里已有），不改路由。`set_model` 永远 enforced。
      if (entry.enforced !== true) {
        ctx.logger?.info?.(
          `dsh-decision-engine: [观察] 子代理 ${session.id} 本应改用 ${entry.provider}/${entry.model}` +
            `${entry.effort === undefined ? "" : ` @ ${entry.effort}`}`,
        );
        return;
      }

      const current = { provider: agent.options?.provider, model: agent.options?.model };
      const currentEffort = agent.options?.reasoningEffort;
      // 路由与强度**都**没变就不必 select：那只会多写一条 `model/selection`，
      // 并让会话里凭空出现一条「模型已切换」的提示。
      //
      // 强度这一半必须与子代理**当前**的 effort 比，不能只看「我们这次有没有
      // 解析出 effort」：解析出 `off` 而子代理本来就是 `off` 时，select 同样
      // 是一次无意义的写入。
      if (sameRoute(current, entry) && (entry.effort ?? undefined) === (currentEffort ?? undefined)) return;

      agent.model?.select?.({
        provider: entry.provider,
        model: entry.model,
        // 宿主的契约：省略 effort = 跟随适配器默认值，**不**继承上一组的 effort。
        ...entry.effort === undefined ? {} : { reasoningEffort: entry.effort },
      });
      ctx.logger?.info?.(
        `dsh-decision-engine: 子代理 ${session.id} 路由 ${current.provider ?? "?"}/${current.model ?? "?"} → ` +
          `${entry.provider}/${entry.model}${entry.effort === undefined ? "" : ` @ ${entry.effort}`}` +
          `（来源：${entry.source === "set_model" ? "set_model" : "决策模型"}）`,
      );
    } catch (error) {
      telemetry.noteAdapterError("spawnModel", error, ctx);
    }
  };

  ctx.on("agent/created", created);

  /**
   * 会话销毁时清掉该会话的显式覆盖与待判队列。
   *
   * 两者都以会话 id 为键、都活在内存里；不清理的话长跑进程会随会话数线性
   * 增长——这类泄漏不会立刻出错，只会在几天后表现为「内存只涨不落」。
   */
  const disposed = (payload) => {
    try {
      const sessionId = payload?.agent?.session?.id;
      if (typeof sessionId !== "string") return;
      pending.delete(sessionId);
      forgetSpawnOverride(sessionId);
    } catch {
      /* 清理失败不影响任何裁决 */
    }
  };

  ctx.on("agent/disposed", disposed);

  return { mounted: true };
}

/**
 * 收集候选路由，**不需要用户为本插件单独配置**。
 *
 * 三级回退，每一级都只用宿主已有的信息：
 *
 *   1. 会话的 `subagent/model-selection-policy`（用户在 DSH 设置里配好的授权路由）；
 *   2. `llm.listProviders()` × `llm.listModels()` 的真实枚举；
 *   3. lead 当前路由（保证「继承」永远是合法选项）。
 *
 * 为什么按这个顺序：第 1 级是**用户明确的授权**——它既表达了「这些路由可以用」，
 * 也隐含了「其余的别碰」。枚举可能包含用户不想让子代理用的路由（例如昂贵的
 * 旗舰模型），所以只有在没有任何授权策略时才退回枚举。
 *
 * @param ctx - 插件上下文（用于 `ctx.get('llm')`）。
 * @param parent - 派生的父 agent。
 * @param current - lead 当前路由。
 * @param cfg - 当前配置。
 * @returns 候选路由数组（可能只含 lead 当前路由）。
 */
async function collectCandidates(ctx, parent, current, cfg) {
  // 1) 宿主授权的子代理路由。
  const allowed = policyRoutes(parent.session);
  if (allowed.length > 0) {
    return withCurrent(candidateRoutes(allowed, cfg.spawnModelMaxCandidates), current);
  }

  // 2) 适配器枚举的真实路由。
  const llm = ctx.get?.("llm");
  if (llm !== undefined && typeof llm.listProviders === "function" && typeof llm.listModels === "function") {
    const enumerated = [];
    try {
      for (const provider of llm.listProviders()) {
        if (typeof provider?.id !== "string" || provider.id.length === 0) continue;
        // 枚举是**尽力而为**：任何一家的失败不该让整份候选清单消失。
        const models = await llm.listModels(provider.id).catch(() => []);
        for (const model of Array.isArray(models) ? models : []) {
          if (typeof model?.id === "string" && model.id.length > 0) {
            enumerated.push({ provider: provider.id, model: model.id });
          }
        }
      }
    } catch {
      /* 枚举失败就退回第 3 级 */
    }
    if (enumerated.length > 0) {
      return withCurrent(candidateRoutes(enumerated, cfg.spawnModelMaxCandidates), current);
    }
  }

  // 3) 至少给「继承」这一个选项。
  return withCurrent([], current);
}

/**
 * 确保候选里含 lead 当前路由。
 *
 * 这一条不能省：模型必须始终能选「就用 lead 那个模型」。若候选里没有它，
 * 最合理的答案（继承）反而成了非法选项，模型只能被迫换一个——那是本适配器
 * 最不该做的事。
 *
 * @param routes - 已规整的候选。
 * @param current - lead 当前路由。
 * @returns 含 current 的候选（current 排在最前）。
 */
function withCurrent(routes, current) {
  if (!isRoute(current)) return routes;
  const rest = routes.filter((route) => !sameRoute(route, current));
  return [{ provider: current.provider, model: current.model }, ...rest];
}

/**
 * 读会话里宿主的子代理路由授权策略。
 *
 * 宿主把这份白名单作为一条 log-only 事件写进会话（`subagent/model-selection-policy`，
 * 不带 `surfaceOp`、不进模型历史）。直接读事件而不是注册同名投影，是因为投影
 * 定义没有公开导出——而事件本身是宿主自己写的、形状稳定。
 *
 * @param session - 父会话。
 * @returns 授权路由数组；没有策略时返回空数组。
 */
function policyRoutes(session) {
  try {
    const events = sessionEventsOf(session);
    // 从后往前找：策略只在会话早期写入一次，但 resume 后可能有更多。
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event?.type !== "subagent/model-selection-policy") continue;
      const allowed = event.data?.allowedModels;
      if (Array.isArray(allowed)) return allowed.filter(isRoute);
    }
  } catch {
    /* 读不到就当没有策略 */
  }
  return [];
}

/**
 * 读子代理会话里持久化的 description（`subagent/descriptor` 的 `label`）。
 *
 * 这是宿主自己写进子代理会话的第一条事件，值与派生调用里的 `description`
 * 参数逐字相同，因此可以拿它把「哪次派生」与「哪个子代理」对上。
 *
 * @param session - 子代理会话。
 * @returns label，取不到时返回空串。
 */
function descriptorLabel(session) {
  try {
    const events = sessionEventsOf(session);
    for (const event of events) {
      if (event?.type !== "subagent/descriptor") continue;
      // 事件载荷**就是**描述符本身（`'subagent/descriptor': SubagentDescriptorData`），
      // 不是 `{ descriptor: … }` 包一层。
      const label = event.data?.label;
      if (typeof label === "string" && label.length > 0) return label;
    }
  } catch {
    /* 读不到就退回 FIFO */
  }
  return "";
}

/**
 * 读一个 agent 当前的生效路由。
 *
 * 最新一次请求 header 优先，其次才是创建时的 options——这正是宿主在派生时
 * 用来填子代理 options 的那份值。
 *
 * @param agent - 宿主 Agent。
 * @returns `{ provider, model }`（可能缺字段）。
 */
function currentRoute(agent) {
  try {
    const config = agent?.session?.requestHeader?.()?.config;
    if (config !== undefined) return { provider: config.provider, model: config.model };
  } catch {
    /* 落到 options */
  }
  return { provider: agent?.options?.provider, model: agent?.options?.model };
}

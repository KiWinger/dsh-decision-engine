/**
 * 子代理模型阶梯 —— 适配器。
 *
 * ## 为什么是两个钩子，而不是一个
 *
 * 宿主的派生时序是固定的，而且两个「可能有用」的时刻各自缺一半信息：
 *
 *   tools/pre-execute（subagent 调用）
 *     ✓ 拿得到**完整任务**（`arguments.prompt`）
 *     ✗ 子代理还不存在，没有任何对象可以改路由
 *
 *   agent/created（子代理创建完成、首步尚未开始）
 *     ✓ 子代理已经存在，`agent.model.select()` 立刻生效
 *     ✗ 载荷里只有 `agent` 与 `source`，拿不到任务内容
 *
 * 所以这里拆成两段，用一条**待判队列**把它们接起来：
 *
 *   1. `tools/pre-execute` 认出「这是一次子代理派生」，用完整 prompt 问决策
 *      模型，把结果（目标档位）按父会话 id 入队；
 *   2. `agent/created` 认出「这是刚派生出来的子代理」，从队列里取走一条并
 *      调用 `agent.model.select()`。
 *
 * 第 2 步必须发生在 `agent/created`，不能拖到 `agent/pre-step`：循环是在
 * **派发 pre-step 之前**捕获本步 selection 的（`preStep()` 第一行就是
 * `model.current()`），所以在 pre-step 里 select 只能影响**下一步**。对只跑
 * 一两步的子代理来说，那等于永远不生效。而在 `agent/created` 里 select，
 * 子代理的第一次请求就用新路由。
 *
 * ## 三道不介入的边界
 *
 *   1. **只处理子代理会话**：`session.header.origin === 'subagent'`。
 *   2. **只处理继承来的路由**：若 lead 在派生时显式给了 provider/model，宿主
 *      会把子代理的 options 设成那一组——此时本点完全不介入，显式选择优先。
 *   3. **只处理有对应队列项的子代理**：拿不到待判记录（例如 workflow /
 *      agent team 自己起的子代理）就原样继承，绝不猜。
 *
 * 三条都落在「宁可不动」这一侧：插件的判断是优化，不是正确性的必要条件。
 *
 * @module dsh-decision-engine/adapters/spawn
 */

import { effortForScore, isRoute, parseLadder, sameRoute, tierForScore } from "../spawn-model.js";
import { forgetSpawnOverride, spawnOverrideOf } from "../spawn-model-tools.js";
import { sessionEventsOf } from "../session-events.js";

/** 待判队列的存活上限：超过这个时间的条目视为「那次派生没成功」。 */
const PENDING_TTL_MS = 120_000;

/**
 * 挂载子代理模型阶梯。
 *
 * @param ctx - cordis 插件上下文。
 * @param deps - 运行期依赖。
 * @returns `{ mounted }`。
 */
export function mountSpawnPoint(ctx, deps) {
  const { runner, getConfig, telemetry } = deps;

  /**
   * 待判队列：父会话 id → 待应用的档位数组（FIFO）。
   *
   * 用数组而不是单个值：lead 可以在一条消息里并行派生多个子代理，每个
   * 都有自己的 prompt 与自己的档位。按入队顺序取走，条数天然对齐。
   */
  const pending = new Map();

  /** 记一条待应用的档位。 */
  const push = (parentId, entry) => {
    const list = pending.get(parentId);
    if (list === undefined) pending.set(parentId, [entry]);
    else list.push(entry);
  };

  /**
   * 取走一条待应用的档位（顺手清掉过期条目）。
   *
   * 优先按 `label`（子代理会话里持久化的 description）精确配对，配不上才
   * 退回 FIFO。为什么需要精确配对：lead 可以在一条消息里并行派生多个子代理，
   * 而宿主的 create 是并发执行的——`agent/created` 的到达顺序与工具调用的
   * 发起顺序**不保证一致**。纯 FIFO 在那种情况下会把 A 的档位发给 B。
   *
   * @param parentId - 父会话 id。
   * @param label - 子代理的 description（可能是空串）。
   * @returns 档位记录，或 undefined。
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
   * 在一次子代理派生**发出之前**判断档位。
   *
   * 这里刻意用 `runner.ask` 而不是自己发请求：超时、冷却、答案校验、遥测、
   * 决策明细全部走同一条链路，与其余七个决策点完全一致。降级时 `ask` 返回
   * 没有 `action`，于是什么都不入队，子代理原样继承——这就是 fail-open。
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

      // ---- 自动路：决策模型判断 -------------------------------------------
      if (!runner.participates("spawnModel")) return next();

      const ladder = parseLadder(cfg.spawnModelLadder);
      // 阶梯为空 = 没有目标可下沉。问一次模型再放弃是纯浪费（同 route 点）。
      // 注意这里必须用**解析后**的阶梯：配置里是 `provider/model[/effort]`
      // 字符串，而分档要的是结构化路由。直接把字符串交给 tierForScore
      // 会拿到一个字符串当路由，拼出 undefined/undefined 的目标。
      if (ladder.length === 0) return next();

      const prompt = typeof args.prompt === "string" ? args.prompt.trim() : "";
      // 没有 prompt 就没什么可判断的（子代理工具的两个必填参数之一）。
      if (prompt.length === 0) return next();

      const llm = ctx.get?.("llm");
      if (llm === undefined) return next();

      const result = await runner.ask(
        "spawnModel",
        {
          task: prompt.slice(0, Math.max(200, cfg.spawnModelTaskChars ?? 1600)),
          description: typeof args.description === "string" ? args.description : "",
          depth: typeof parent.session?.header?.delegationDepth === "number"
            ? parent.session.header.delegationDepth + 1
            : 1,
          ladder: ladder.map((entry) => `${entry.provider}/${entry.model}`),
          parent: currentRouteText(parent),
          // effort 清单要按**目标模型**查，这里还不知道目标，所以交给第 2 段。
          efforts: [],
          recent: deps.digestRecent(parent.session, cfg.recentMessages, cfg.recentMessageChars),
        },
        // session / step 只给「决策历史」明细用，不参与裁决。
        { signal: exec.signal, session: parent.session },
      );

      if (result.action?.kind !== "switch") return next();

      const tier = tierForScore(ladder, result.action.capability);
      if (tier === undefined) return next();

      // 推理强度按目标模型**实际公布**的清单取；取不到就省略该字段。
      // 硬塞一个该模型不支持的 id 会让宿主抛 UNSUPPORTED_REASONING_EFFORT，
      // 子代理直接派生失败——那比「用错强度」贵得多。
      let effort = tier.effort;
      if (effort === undefined) {
        try {
          const info = await llm.resolveModelInfo(tier.provider, tier.model, exec.signal);
          effort = effortForScore(info?.reasoning?.efforts, result.action.depth);
        } catch {
          // 查不到元数据 = 这条路由可能压根不可用。不赌，原样继承。
          ctx.logger?.warn?.(
            `dsh-decision-engine: 无法确认 ${tier.provider}/${tier.model} 的模型信息，子代理沿用 lead 的路由`,
          );
          return next();
        }
      }

      push(parentId, {
        at: Date.now(),
        provider: tier.provider,
        model: tier.model,
        ...effort === undefined ? {} : { effort },
        // 用派生的 description 当匹配键：并行派生时 FIFO 顺序并不等于
        // 子代理的创建顺序（宿主的 create 是并发进行的），按 label 配对
        // 才能保证每个子代理拿到自己那次的档位。
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
   * 在子代理首步开始**之前**应用档位。
   *
   * `agent/created` 是串行（serial）事件：它返回之后 `ctx.agents.create()`
   * 才返回，子代理 manager 才把首条 prompt 投进 inbox。所以在这一刻 select
   * 改的是「第一次请求」用的路由，而不是「下一次」。
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
   * 两者都以会话 id 为键、都活在内存里；不清理的话长跑进程会随会话数
   * 线性增长——这类泄漏不会立刻出错，只会在几天后表现为「内存只涨不落」。
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

/** 读一个 agent 当前的生效路由，渲染成 `provider/model` 文本。 */
function currentRouteText(agent) {
  try {
    const config = agent?.session?.requestHeader?.()?.config;
    const provider = config?.provider ?? agent?.options?.provider;
    const model = config?.model ?? agent?.options?.model;
    if (typeof provider !== "string" || typeof model !== "string") return "";
    return `${provider}/${model}`;
  } catch {
    return "";
  }
}

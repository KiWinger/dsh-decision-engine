/**
 * 子代理模型的**模型可调用**工具：`list_models` / `set_model` / `list_presets`。
 *
 * ## 为什么这些必须是真工具，而不是内部函数
 *
 * 决策端点只有三种题型（choice / score / noul），**不能调用工具**。所以
 * 「决策模型自己去查模型清单再挑一个」在协议上根本不存在。模型清单与
 * effort 清单必须由**能调用工具的 agent** 查出来，交给决策模型当 state。
 *
 * 于是这里分成两条互不干扰的路：
 *
 *   - **自动路**（`spawnModel` 决策点）：决策模型只回答两个 0–1 分数，
 *     档位由本地阶梯映射，effort 由宿主公布的清单映射。全程不需要工具。
 *   - **显式路**（本文件）：lead 自己查、自己定，覆盖自动判断。
 *
 * 优先级是 **显式 set > 决策模型 > 继承 lead**。这是有意为之：模型自己
 * 说「这个子任务我要指定用 X」时，任何启发式都不该压过它。
 *
 * ## 覆盖的作用域
 *
 * 覆盖按**父会话**存（`Map<sessionId, route>`），不是全局：一个会话里
 * `set_model` 不该影响另一个会话正在跑的活。`clear: true` 撤销。
 *
 * @module dsh-decision-engine/spawn-model-tools
 */

import { effortForScore, formatRoute, isRoute, orderEfforts } from "./spawn-model.js";

/**
 * 每个会话的显式覆盖：sessionId → `{ provider, model, effort? }`。
 *
 * 只活在内存里，随插件挂载创建、随宿主重载销毁。刻意**不落盘**：
 * 「这个会话接下来派生的子代理用什么模型」是一个会话内的临时决定，
 * 写进 config.yml 会让它变成下次启动的默认值——那不是用户的意思。
 */
const overrides = new Map();

/** 取某会话的显式覆盖。 */
export function spawnOverrideOf(sessionId) {
  if (typeof sessionId !== "string") return undefined;
  return overrides.get(sessionId);
}

/** 清掉某会话的显式覆盖（会话销毁时调用，避免 Map 无界增长）。 */
export function forgetSpawnOverride(sessionId) {
  if (typeof sessionId === "string") overrides.delete(sessionId);
}

/**
 * 注册三个模型可调用工具。
 *
 * @param ctx - cordis 插件上下文。
 * @param deps - `{ getConfig }`。
 * @returns 是否挂上了（`tools` 或 `llm` 服务缺失时为 false）。
 */
export function mountSpawnModelTools(ctx, deps) {
  const tools = ctx.get?.("tools");
  const llm = ctx.get?.("llm");
  // 缺服务时不注册也不抛：宿主可能是一个不带 llm 的极简组合，
  // 那种环境里「查模型」本来就没有意义，而抛错会让整个插件挂不上。
  if (tools === undefined || llm === undefined) return false;
  if (typeof tools.register !== "function") return false;

  const disposers = [];

  // ------------------------------------------------------------- list_models
  /**
   * 列出可用于子代理的 provider / model / effort。
   *
   * 三档查询（与宿主的 `list_subagent_models` 同形，便于模型迁移习惯）：
   * 无参 → provider 清单；`provider` → 该家的模型；`provider` + `model` →
   * 该模型与它的 effort 清单。
   */
  disposers.push(
    tools.register({
      name: "list_models",
      description:
        "List the LLM providers, models, and reasoning efforts available for a subagent. "
        + "No arguments: provider ids. `provider`: that provider's models. "
        + "`provider` and `model`: that model with its reasoning efforts. "
        + "Use it before set_model, and omit optional fields rather than sending empty strings.",
      parameters: {
        provider: { type: "string", description: "Registered provider id." },
        model: { type: "string", description: "Exact model id; requires provider." },
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      isConcurrencySafe: () => true,
      async execute(args) {
        const provider = typeof args?.provider === "string" && args.provider.length > 0 ? args.provider : undefined;
        const model = typeof args?.model === "string" && args.model.length > 0 ? args.model : undefined;
        if (model !== undefined && provider === undefined) {
          throw new Error("`model` requires `provider`");
        }
        const providers = llm.listProviders();
        if (provider === undefined) {
          return providers.length === 0
            ? "(no LLM providers)"
            : providers.map((entry) => `${entry.id} — ${entry.name}`).join("\n");
        }
        if (!providers.some((entry) => entry.id === provider)) {
          throw new Error(
            `LLM provider "${provider}" is not registered; available providers: ` +
              (providers.map((entry) => entry.id).join(", ") || "(none)"),
          );
        }
        if (model === undefined) {
          const models = await llm.listModels(provider);
          return models.length === 0
            ? `(no advertised models for ${provider})`
            : models
                .map((entry) => `${provider}/${entry.id} — ${entry.name}${entry.description === undefined ? "" : `: ${entry.description}`}`)
                .join("\n");
        }
        const info = await llm.resolveModelInfo(provider, model);
        const efforts = orderEfforts(info?.reasoning?.efforts)
          .map(
            (effort) =>
              `${effort.id}${info.reasoning?.defaultEffort === effort.id ? " (default)" : ""} — ${effort.name}` +
              (effort.description === undefined ? "" : `: ${effort.description}`),
          )
          .join("\n");
        return (
          `${provider}/${model} — ${info?.name ?? model}\n` +
          `Reasoning efforts:\n${efforts.length === 0 ? "(no advertised reasoning efforts)" : efforts}`
        );
      },
    }),
  );

  // -------------------------------------------------------------- set_model
  /**
   * 为**接下来派生的子代理**指定模型与推理强度。
   *
   * 只作用于本会话，且只作用于「没有在派生调用里显式给 provider/model」的
   * 子代理——后者是模型在工具参数上的直接选择，优先级最高。
   */
  disposers.push(
    tools.register({
      name: "set_model",
      description:
        "Choose the model and reasoning effort for subagents spawned later in this session, "
        + "overriding this plugin's automatic judgement. Only affects delegations that do not "
        + "name `provider`/`model` themselves. Use list_models first to see valid ids. "
        + "Pass `clear: true` to return to automatic selection.",
      parameters: {
        provider: { type: "string", description: "Registered provider id; requires model." },
        model: { type: "string", description: "Exact model id; requires provider." },
        reasoning_effort: {
          type: "string",
          description: "Reasoning effort id from list_models. Omit to use the model's default effort.",
        },
        clear: { type: "boolean", description: "Clear this session's override and return to automatic selection." },
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      async execute(args, exec) {
        const sessionId = exec?.agent?.session?.id;
        if (typeof sessionId !== "string") {
          throw new Error("set_model requires a calling agent session");
        }
        if (args?.clear === true) {
          overrides.delete(sessionId);
          return "Subagent model override cleared; automatic selection is active again.";
        }
        const provider = typeof args?.provider === "string" ? args.provider : "";
        const model = typeof args?.model === "string" ? args.model : "";
        if (provider.length === 0 || model.length === 0) {
          throw new Error("set_model requires both `provider` and `model` (or `clear: true`)");
        }
        const effort = typeof args?.reasoning_effort === "string" ? args.reasoning_effort : "";
        if (args?.reasoning_effort !== undefined && effort.length === 0) {
          throw new Error("`reasoning_effort` must be non-empty when supplied");
        }
        // 校验在写入之前：让不合法的选择在这里失败，而不是等到子代理派生时
        // 由宿主抛出 UNSUPPORTED_REASONING_EFFORT——那时错误离用户的动作
        // 已经很远，很难理解。
        if (!llm.listProviders().some((entry) => entry.id === provider)) {
          throw new Error(`LLM provider "${provider}" is not registered; run list_models to see valid ids`);
        }
        const info = await llm.resolveModelInfo(provider, model);
        if (effort.length > 0) {
          const known = orderEfforts(info?.reasoning?.efforts).map((entry) => entry.id);
          if (!known.includes(effort)) {
            throw new Error(
              `model "${provider}/${model}" does not offer reasoning effort "${effort}"; ` +
                (known.length === 0 ? "it advertises none" : `available: ${known.join(", ")}`),
            );
          }
        }
        overrides.set(sessionId, {
          provider,
          model,
          ...effort.length === 0 ? {} : { effort },
        });
        const rendered = `${provider}/${model}${effort.length === 0 ? "" : ` @ ${effort}`}`;
        return `Subagents spawned later in this session will use ${rendered}.`;
      },
    }),
  );

  // ----------------------------------------------------------- list_presets
  /**
   * 只读地列出 agent preset。
   *
   * **本版本不提供 switch_preset**：宿主的 `agentPresets.select()` 在会话
   * 已经开过 turn 之后返回 `agent-preset/locked`，而插件无法改写 subagent
   * 工具的 `agent_preset` 参数（工具参数由模型给出）。也就是说「切换 preset」
   * 只能靠拦下这次调用再让模型带新参数重发——那是与「技能选择」点同类的
   * 拒绝-重试模式，需要单独设计，不属于本版本范围。
   *
   * 保留这个只读工具的理由：它让模型知道有哪些 preset 可**在派生时**直接
   * 指定（子代理工具的 `agent_preset` 参数），不需要切换。
   */
  disposers.push(
    tools.register({
      name: "list_presets",
      description:
        "List the agent presets available on this machine, for naming one in a subagent's "
        + "`agent_preset` argument. Read-only: this version cannot switch the current session's preset.",
      parameters: {},
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      isConcurrencySafe: () => true,
      async execute() {
        const presets = ctx.get?.("agentPresets");
        if (presets === undefined || typeof presets.list !== "function") {
          return "(this deployment has no agent-preset roster)";
        }
        const rows = await presets.list();
        if (!Array.isArray(rows) || rows.length === 0) return "(no agent presets declared)";
        return rows
          .map((row) => {
            const label = typeof row?.name === "string" && row.name.length > 0 ? row.name : row?.id;
            const broken = row?.broken === undefined ? "" : " [failed to load]";
            const description = typeof row?.description === "string" && row.description.length > 0
              ? ` — ${row.description}`
              : "";
            return `${row?.id} — ${label}${description}${broken}`;
          })
          .join("\n");
      },
    }),
  );

  // 随插件卸载一起撤掉，避免宿主重载后留下失效的工具定义。
  ctx.effect?.(() => () => {
    for (const dispose of disposers) {
      try {
        dispose();
      } catch {
        /* 卸载尽力而为 */
      }
    }
  });

  return true;
}

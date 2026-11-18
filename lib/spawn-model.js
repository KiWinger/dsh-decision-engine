/**
 * 子代理模型 —— 纯函数层。
 *
 * ## 这一层解决什么问题
 *
 * 宿主派生 subagent 时的默认行为是「继承 lead 的 provider / model / 推理强度」
 * （`resolveChildAgentOptions` → `parentAgentOptionsForDelegation`）。这个默认值
 * 只对「lead 自己也在做同类工作」成立：让便宜模型去调研、让强模型去改十行
 * 格式，两种情况下继承都是错的，而且错的方向还不一样。
 *
 * 本模块把「该用哪个模型 + 哪个推理强度」变成可以离线验证的两步：
 *
 *   1. **候选**：从宿主**已经存在**的路由白名单里取（见 `candidateRoutes`），
 *      而不是让用户再配一遍阶梯；
 *   2. **挑选**：决策模型在候选里做 choice 选一个，effort 再按**该模型实际
 *      公布的清单**取档，而不是猜一个 id 塞过去。
 *
 * ## 为什么不让决策模型直接输出 provider/model 字符串
 *
 * 决策端点只有三种题型（choice / score / noul），**没有自由文本**。所以
 * 「模型自己挑」在协议上的唯一形态就是 choice：把候选路由当选项，让模型选
 * 一个。这同时解决了合法性——选项全部来自宿主确认可用的路由，选出来的东西
 * 一定存在，不会拼错。
 *
 * ## 候选从哪来（优先级）
 *
 *   1. 宿主会话的 `subagent/model-selection-policy` 事件里的 `allowedModels`
 *      —— 用户已经在 DSH 设置里配好的、明确授权给子代理的路由；
 *   2. 该策略不存在时，退回 `llm.listProviders()` × `llm.listModels()` 的
 *      真实枚举（宿主的适配器目录）；
 *   3. 都没有时，退回「lead 当前路由 + 本插件配置里可选的额外候选」。
 *
 * 三条都**不需要用户为本插件单独配置**：前两条直接复用宿主已有的信息。
 *
 * @module dsh-decision-engine/spawn-model
 */

/**
 * 已知推理强度的强弱次序。
 *
 * 用来给模型公布的 `efforts` 排序：宿主适配器**不保证**清单是升序（DeepSeek 的
 * 是 off/low/high/max，恰好升序，但那是它的实现细节）。认出 id 就按这张表排，
 * 认不出就保留公布顺序——两种都能用，只是前者更可靠。
 */
export const EFFORT_RANK = {
  off: 0,
  none: 0,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  max: 5,
  xhigh: 6,
};

/**
 * choice 选项的 key 里**不允许**出现的字符。
 *
 * 端点把 criteria 的键原样当选项 id 回传，而 provider/model 里可能有 `/`、
 * 空格、点、冒号。用原始路由当 key 会让某些端点把它当路径或截断；统一编码成
 * 安全 key，再在本地映射回真实路由——模型看到的仍然是可读的路由文本（写在
 * 选项的描述里），但它回传的是一个稳定的短 id。
 *
 * @param route - 一条路由。
 * @param index - 它在候选里的位置。
 * @returns `r0` / `r1` … 这样的稳定 key。
 */
export function routeKey(index) {
  return `r${Number.isFinite(index) && index >= 0 ? Math.floor(index) : 0}`;
}

/**
 * 把一条路由渲染成 `provider/model` 文本（用于日志、决策理由与 state）。
 * @param route - 含 provider / model 的对象。
 * @returns 可读路由；形状不合法时返回空串。
 */
export function formatRoute(route) {
  if (route === null || typeof route !== "object") return "";
  const provider = typeof route.provider === "string" ? route.provider : "";
  const model = typeof route.model === "string" ? route.model : "";
  if (provider.length === 0 || model.length === 0) return "";
  return `${provider}/${model}`;
}

/**
 * 校验一条路由的形状（不做任何网络/宿主查询）。
 * @param route - 候选路由。
 * @returns 是否为「provider 与 model 都是非空字符串」。
 */
export function isRoute(route) {
  return (
    route !== null &&
    typeof route === "object" &&
    typeof route.provider === "string" &&
    route.provider.length > 0 &&
    typeof route.model === "string" &&
    route.model.length > 0
  );
}

/**
 * 两条路由是否指向同一个 provider + model（**不比较推理强度**）。
 *
 * 用途是判定「子代理的路由是不是原样继承来的」：宿主在 lead 显式指定路由时
 * 会把子代理的 options 设成指定的那组，未指定时则原样复制 lead 的当前路由。
 * 因此「与 lead 当前路由相同」= 继承，「不同」= 显式选择。
 *
 * @param left - 第一条路由。
 * @param right - 第二条路由。
 * @returns 是否同一路由。
 */
export function sameRoute(left, right) {
  if (left === null || typeof left !== "object") return false;
  if (right === null || typeof right !== "object") return false;
  if (typeof left.provider !== "string" || typeof right.provider !== "string") return false;
  if (typeof left.model !== "string" || typeof right.model !== "string") return false;
  return left.provider === right.provider && left.model === right.model;
}

/**
 * 规整一份候选路由清单：去重、丢弃形状不合法的项、保持原顺序。
 *
 * 顺序有意义：它就是端点 criteria 的呈现顺序，也是 `routeKey` 的编号依据。
 * 去重按 provider + model（同一路由出现两次只会让模型在两个一样的选项间
 * 犹豫）。
 *
 * @param routes - 任意候选数组。
 * @param limit - 上限（端点对选项数没有硬限制，但太多选项会让小模型选择
 *   质量下降；默认 12）。
 * @returns 规整后的路由数组。
 */
export function candidateRoutes(routes, limit = 12) {
  if (!Array.isArray(routes)) return [];
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 12;
  const out = [];
  const seen = new Set();
  for (const route of routes) {
    if (!isRoute(route)) continue;
    const key = `${route.provider}\u0000${route.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ provider: route.provider, model: route.model });
    if (out.length >= max) break;
  }
  return out;
}

/**
 * 把候选路由做成 choice 题的 criteria。
 *
 * 每个选项的**键**是稳定短 id（`r0`…），**值**是可读路由文本。这样模型回传的
 * 是短 id，而它读到的是完整路由——两者都不依赖路由文本本身是否适合当 JSON
 * 键。同时把当前 lead 的路由标出来，让模型知道「继承」是哪个选项。
 *
 * @param routes - `candidateRoutes` 的结果。
 * @param currentRoute - lead 当前路由（可缺省）。
 * @returns criteria 对象；候选为空时返回空对象。
 */
export function routeCriteria(routes, currentRoute) {
  const criteria = {};
  routes.forEach((route, index) => {
    const text = formatRoute(route);
    const isCurrent = sameRoute(route, currentRoute);
    criteria[routeKey(index)] = isCurrent ? `${text} (the lead's current route)` : text;
  });
  return criteria;
}

/**
 * 把模型回传的 choice 还原成候选里的真实路由。
 *
 * @param choice - 模型回传的选项键（`r0`…）。
 * @param routes - `candidateRoutes` 的结果（顺序必须与出题时一致）。
 * @returns 对应的路由，或 undefined（键不在候选里）。
 */
export function routeFromChoice(choice, routes) {
  if (typeof choice !== "string" || !Array.isArray(routes)) return undefined;
  const matched = /^r(\d+)$/.exec(choice);
  if (matched === null) return undefined;
  const index = Number(matched[1]);
  if (!Number.isInteger(index) || index < 0 || index >= routes.length) return undefined;
  return routes[index];
}

/**
 * 给模型公布的 effort 清单排序（弱 → 强）。
 *
 * 全部 id 都认识时按 `EFFORT_RANK` 排；只要有一个不认识，就**保留公布顺序**——
 * 混着排会让不认识的 id 被塞到某个猜测位置，而猜错的后果是「强度取反」。
 *
 * @param efforts - 宿主 `modelInfo.reasoning.efforts`（`{id, name}` 数组）。
 * @returns 排好序的新数组。
 */
export function orderEfforts(efforts) {
  if (!Array.isArray(efforts)) return [];
  const items = efforts.filter(
    (effort) => effort !== null && typeof effort === "object" && typeof effort.id === "string" && effort.id.length > 0,
  );
  const allKnown = items.every((effort) => Object.hasOwn(EFFORT_RANK, effort.id));
  if (!allKnown) return [...items];
  return [...items].sort((left, right) => EFFORT_RANK[left.id] - EFFORT_RANK[right.id]);
}

/**
 * 按分数在该模型实际公布的 effort 里取一档。
 *
 * 模型没公布 effort 清单时返回 undefined —— 那表示「这个模型不接受推理强度」，
 * 调用方必须**省略**该字段，而不是硬塞一个 id（宿主会抛
 * `UNSUPPORTED_REASONING_EFFORT`，子代理直接派生失败）。
 *
 * @param efforts - `modelInfo.reasoning.efforts`。
 * @param score - 归一后的思考深度需求，[0,1]。
 * @returns effort id，或 undefined。
 */
export function effortForScore(efforts, score) {
  const ordered = orderEfforts(efforts);
  if (ordered.length === 0) return undefined;
  const numeric = typeof score === "number" && Number.isFinite(score) ? score : 0;
  const index = Math.min(ordered.length - 1, Math.max(0, Math.floor(numeric * ordered.length)));
  return ordered[index].id;
}

/**
 * 子代理模型阶梯 —— 纯函数层。
 *
 * ## 这一层解决什么问题
 *
 * 宿主派生 subagent 时的默认行为是「继承 lead 的 provider / model / 推理强度」
 * （`resolveChildAgentOptions` → `parentAgentOptionsForDelegation`）。这个默认值
 * 只对「lead 自己也在做同类工作」成立：让一个便宜模型去调研、让一个强模型
 * 去改十行格式，两种情况下继承都是错的，而且错的方向还不一样。
 *
 * 本模块把「该用哪个模型 + 哪个推理强度」变成可以离线验证的两步：
 *
 *   1. **档位**：配置里一条有序的阶梯（便宜 → 强），决策模型只回答「这个任务
 *      需要多少能力」（0–1），阶梯把它映射成一个具体档位；
 *   2. **推理强度**：决策模型再回答「需要多深的思考」（0–1），我们按**该模型
 *      实际公布的 effort 清单**取档，而不是猜一个 id 塞过去。
 *
 * ## 为什么不让决策模型直接挑 provider/model
 *
 * 决策端点只有三种题型（choice / score / noul），没有自由文本。用 choice 让
 * 模型从几十条路由里挑一个，等于把一串 `provider/model` 当成选项 key 塞进
 * criteria——小模型会拼错、会选到不存在的组合，而**拼错的代价是派生直接失败**
 * （宿主 `resolveCallConfig` 会抛 UNSUPPORTED / 未注册 provider）。分数 + 本地
 * 阶梯把「模型判断」与「路由合法性」分开：模型只给倾向，合法性由本地保证。
 *
 * ## 阶梯的编码
 *
 * 本插件的配置读取器只认标量与字符串数组，因此阶梯是**字符串数组**，每项写成
 *
 *     provider/model[/effort]
 *
 * 例如：
 *
 *     spawnModelLadder: [deepseek-official/deepseek-chat, deepseek-official/deepseek-reasoner]
 *
 * 顺序即「从便宜到强」。写错的项被**逐条跳过**而不是整表作废——一条手写错误
 * 不该让整个功能静默失效，但也绝不能让它变成一个非法路由。
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
 * 解析一条阶梯项。
 *
 * ## 歧义与取舍
 *
 * `provider/vendor/model`（第三方聚合路由，model id 自带斜杠）与
 * `provider/model/effort`（显式推理强度）**在语法上无法区分**。所以这里
 * 不按位置猜，而是按**语义**判：只有最后一段是已知的 effort id
 * （`EFFORT_RANK` 的键）时才把它当强度，否则整段都是 model。
 *
 * 这个取舍的代价与收益：
 *
 *   - 收益：`openrouter/meta-llama/llama-3-70b` 不会被误读成「model 叫
 *     meta-llama、强度叫 llama-3-70b」——后者会拼出一条根本不存在的路由；
 *   - 代价：若某家模型真的提供一个不在 `EFFORT_RANK` 里的自定义强度名，
 *     那种写法会被当成 model 的一部分。这时**不用写强度**即可（省略它，
 *     模型会用自己的默认值），而写错路由是更糟的失败。
 *
 * provider 只按**第一个**斜杠切：provider id 由宿主用作路由键，不含 `/`。
 *
 * @param entry - 形如 `provider/model` 或 `provider/model/effort` 的字符串。
 * @returns `{ provider, model, effort? }`，或 undefined（形状不合法）。
 */
export function parseLadderEntry(entry) {
  if (typeof entry !== "string") return undefined;
  const text = entry.trim();
  if (text.length === 0) return undefined;
  const first = text.indexOf("/");
  if (first <= 0 || first === text.length - 1) return undefined;
  const provider = text.slice(0, first).trim();
  const rest = text.slice(first + 1).trim();
  if (provider.length === 0 || rest.length === 0) return undefined;

  // 最后一段只有在是**已知 effort id** 时才当强度（见上方歧义说明）。
  const last = rest.lastIndexOf("/");
  if (last > 0) {
    const tail = rest.slice(last + 1).trim();
    if (Object.hasOwn(EFFORT_RANK, tail)) {
      const model = rest.slice(0, last).trim();
      if (model.length === 0) return undefined;
      return { provider, model, effort: tail };
    }
  }
  return { provider, model: rest };
}

/**
 * 解析整条阶梯。
 *
 * 非法项被跳过并**不报错**：配置是手写的，一条写错的项只该让它自己失效。
 * 空表意味着「没有可下沉/升级的目标」，调用方据此完全不介入（与 `route`
 * 的「下沉目标没配就不判断」同一条规矩）。
 *
 * @param entries - 配置里的字符串数组。
 * @returns 合法档位数组，顺序即配置顺序。
 */
export function parseLadder(entries) {
  if (!Array.isArray(entries)) return [];
  const ladder = [];
  for (const entry of entries) {
    const parsed = parseLadderEntry(entry);
    if (parsed !== undefined) ladder.push(parsed);
  }
  return ladder;
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
 * 按分数在阶梯里取档位。
 *
 * 分档是等宽的：`n` 个档位把 `[0,1]` 均分，`score = 1` 落到最后一档。
 * 刻意**不做夹取式偏置**（例如「默认往便宜那档偏」）：偏置属于阶梯本身——
 * 想要更便宜的默认行为，就把便宜档配得更多、或在阶梯里重复它，而不是让
 * 代码偷偷改分数。这样「为什么这次用了这一档」永远能由配置 + 分数复现。
 *
 * @param ladder - `parseLadder` 的结果。
 * @param score - 归一后的能力需求，[0,1]。
 * @returns 档位；阶梯为空时返回 undefined。
 */
export function tierForScore(ladder, score) {
  if (!Array.isArray(ladder) || ladder.length === 0) return undefined;
  const numeric = typeof score === "number" && Number.isFinite(score) ? score : 0;
  const index = Math.min(ladder.length - 1, Math.max(0, Math.floor(numeric * ladder.length)));
  return ladder[index];
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

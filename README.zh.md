# dsh-decision-engine

![dsh-decision-engine — DeepSeek Harness 决策引擎](docs/assets/hero.jpeg)

**提供免费决策模型**

[网站](https://dsh.zuos.us/dsh-decision-engine/) ·
[config.example.yml](config.example.yml) · [DECISIONS.md](DECISIONS.md)

[English](./README.md)

给 DeepSeek Harness 的决策层：主模型动手之前，用一个便宜的决策小模型做结构化判断。

## 头号功能：子代理自己挑模型

DeepSeek Harness 默认让派生出的 subagent **原样继承 lead 的 provider / model /
推理强度**（`resolveChildAgentOptions` → `parentAgentOptionsForDelegation`）。
这个默认值只在「lead 自己也在做同类工作」时才对：把调研类子任务交给 lead 的强
模型是纯浪费；把要求高保真的重构下沉到便宜档，换来的是返工。

`dsh-decision-engine` 取代了这个默认值。**派生 subagent 时，由决策模型自己挑选
模型和推理强度**——你不需要配模型阶梯、不需要填价格表、也不需要再配一遍路由。

- **候选来自你已有的配置。** 会话的 `subagent/model-selection-policy`（你已经在
  DSH 设置里授权给子代理的路由），拿不到时回退到 `llm` 适配器的真实目录。
  本插件里没有任何要你新填的路由。
- **是模型在挑，不是模型打个分再让人解释。** 决策端点只接受
  `choice` / `score` / `noul`，所以候选被做成一道 `choice` 题，选项用稳定短 id
  （`r0`…`rN`）映射回真实的 provider/model。答案畸形就降级为继承——模型没有
  机会拼出一条不存在的路由。
- **「继承」永远在选项里。** lead 当前路由始终是候选之一（并明确标注），所以
  「就用我现在这个」是一个合法答案，而不是被迫换一个。
- **推理强度按目标模型实际公布的能力取。** effort 从该模型自己公布的
  `efforts` 里选；它不公布就**省略该字段**而不是猜一个——猜错的 id 会让子代理
  派生直接失败。
- **显式选择优先级最高。** 派生调用里直接传的 `provider`/`model`，或用
  `set_model` 工具指定的，都高于自动判断。主 agent 可用
  `list_models` / `set_model` / `list_presets`；刻意**不**提供 `switch_preset`
  ——因为会话一旦开过 turn，宿主会锁住 preset。

### 真实环境验证

这不是设计稿。2026-11-19 用**真实决策端点**与**真实宿主模块**跑通了全链路：

| 层次 | 结果 |
|---|---|
| 针对性测试 | `node --test test/spawn-model.test.js test/spawn-adapter.test.js` → **46/46 通过** |
| 全量测试 | `node --test test/` → **772/772 通过** |
| 真实决策端点 | 硅基流动 `systemone`，模型 `Kev-4B` → **HTTP 200**。对一个「逐字照抄文本」的子任务，模型选了**非继承**的 `r1`（`answers.route.choice = "r1"`，概率 `r1 0.5881` vs `r0 0.4119`，`depth.score 0.3651`） |
| 真实端到端换模型 | 把这条真实回答喂进真实的 `spec.parse`/`decide` 与真实 adapter，产出 `agent.model.select({ provider: "qwenwork", model: "deepseek-flash", reasoningEffort: "low" })`——子代理真的**从 lead 的 `modelscope-token-plan/Qwen/Qwen3.8-Flash-Next` 换成了 `qwenwork/deepseek-flash`**，且按该模型公布的能力设好了推理强度 |

上面是单次实测样本，用来证明**题型被接受、模型真的在候选里选择、选择真的落到了子代理的模型上**，
不是承诺每个任务都选同一条路由（同一模型在要求高的任务上正确地选了「继承」）。

## 功能

**九个决策点**（逐个可切换；子代理模型就是上面那个头号功能）：

- 工具授权
- 模型路由
- 子任务分派
- **子代理模型** ← 详见上文
- 上下文压缩
- 轮次延续
- 检索必要性
- 技能选择
- 思维链翻译

**三态**：关闭 · 观察 · 生效

**决策服务**：system one · bamboonode · 硅基流动 SiliconFlow（国内 / 国际）·
Perplexity · OpenRouter · 自定义 base URL

**人工审核比例**：自治 · 轻松 · 默认 · 谨慎

**界面**：配置页（四个可折叠分组）· 决策历史标签页 · 统计与对比 ·
审批卡正文可读化

| 配置页 | 决策历史 |
|---|---|
| ![配置页](docs/assets/config-page.png) | ![决策历史](docs/assets/decisions-tab.png) |

> 截图拍于分组折叠（DEC-051）之前的版式，当前界面为四个可折叠分组。

**省 token**：精确缓存 · 只读工具放行 · state 截断

**可靠性**：默认只记录不拦截 · 任何异常 fail-open 放行 · 超时降级 ·
匿名统计可关

## 许可证

MIT

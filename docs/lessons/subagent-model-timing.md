/**
 * 「子代理已经存在」与「子代理的任务已经可见」发生在两个不同的时刻，
 * 而改模型只在前一个时刻有效。
 *
 * 背景：宿主默认让子代理原样继承 lead 的 provider / model / 推理强度。
 * 想按任务内容给子代理选模型时，直觉上会去找「子代理开始干活」那个钩子，
 * 但那已经晚了。
 *
 * ── 宿主时序（v0.2.x，实测）────────────────────────────────────────────
 *
 *   ctx.subagents.startActivation()
 *     → ctx.agents.create({ agentOptions, setup })
 *         → 进入 Session、跑 setup(childCtx, child)
 *             · 写入 subagent/descriptor（含 label = 派生的 description）
 *         → announce：串行派发 agent/created      ← 唯一能改路由的时刻
 *         → 返回 handle
 *     → 把首条 prompt 投进子代理 inbox
 *
 *   之后每一步：
 *     model.current() 捕获本步 selection      ← 在这一刻已经定死
 *       → 派发 agent/pre-step                  ← 这里 select 只影响下一步
 *       → step/start
 *       → prepareCall / 请求
 *
 * ── 两个缺一半的时刻 ────────────────────────────────────────────────────
 *
 *   tools/pre-execute（subagent 调用）
 *     ✓ 完整任务（arguments.prompt / description）
 *     ✗ 子代理还不存在，没有对象可以改
 *
 *   agent/created
 *     ✓ 子代理已存在，agent.model.select() 立刻对首次请求生效
 *     ✗ 载荷里只有 agent 与 source，没有任务内容
 *
 * 结论：必须自己把两半接起来——pre-execute 判断并入队，agent/created 取走
 * 并落地。别指望在 agent/pre-step 里补救：循环在**派发 pre-step 之前**就
 * 调了 model.current()，那里 select 只能影响下一步；对只跑一两步的子代理，
 * 等于永远不生效。
 *
 * ── 并发派生：FIFO 会串 ────────────────────────────────────────────────
 *
 * lead 可以在一条消息里并行派生多个子代理，而宿主的 create 是并发执行的。
 * agent/created 的到达顺序**不保证**等于工具调用的发起顺序，纯 FIFO 队列会
 * 把 A 的档位发给 B。
 *
 * 配对键用 subagent/descriptor.label：宿主自己写进子代理会话的第一条事件，
 * 值与派生调用的 description 逐字相同。按它配对才稳。
 *
 * ── 相关决策 ───────────────────────────────────────────────────────────
 *
 * DEC-061：子代理模型（决策模型在宿主授权路由里自行挑选模型与推理强度）。
 */

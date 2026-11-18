# dsh-decision-engine

![dsh-decision-engine — decision engine for DeepSeek Harness](docs/assets/hero.jpeg)

**Free decision model usage provided**

[website](https://dsh.zuos.us/dsh-decision-engine/) ·
[config.example.yml](config.example.yml) · [DECISIONS.md](DECISIONS.md)

[简体中文](./README.zh.md)

A judgement layer for DeepSeek Harness: a cheap decision model judges before the
main model acts.

## Headline feature: subagents pick their own model

DeepSeek Harness normally gives a spawned subagent the **exact same provider,
model and reasoning effort as the lead** (`resolveChildAgentOptions` →
`parentAgentOptionsForDelegation`). That default is only right when the lead is
doing the same kind of work itself. Sending a research subtask to the lead's
strong model wastes money; sending a high-fidelity refactor to a cheap tier buys
a rewrite.

`dsh-decision-engine` replaces that default. **When a subagent is spawned, the
decision model itself chooses the model and the reasoning effort** — you do not
configure a model ladder, a price table, or any routes.

- **Candidates come from what you already have.** The session's
  `subagent/model-selection-policy` (the routes you already authorized in DSH
  settings), falling back to the live `llm` adapter catalogue. Nothing new to
  configure in this plugin.
- **The model picks, it doesn't get a score to interpret.** The decision
  endpoint only accepts `choice` / `score` / `noul`, so the candidates become a
  `choice` question with stable short ids (`r0`…`rN`) mapped back to real
  provider/model pairs. A malformed answer degrades to inheritance; the model
  can never invent a non-existent route.
- **Inheriting stays on the table.** The lead's current route is always a
  candidate (labelled as such), so "just use what I'm using" is a valid answer
  rather than a forced switch.
- **Effort follows the target model's published capabilities.** Reasoning
  effort is chosen from the model's own advertised `efforts`; if it publishes
  none, the field is omitted rather than guessed (a guessed id fails the child
  spawn outright).
- **Explicit choice wins.** A `provider`/`model` passed directly in the
  delegation call, or set with the `set_model` tool, outranks the automatic
  judgement. `list_models` / `set_model` / `list_presets` are available to the
  main agent; `switch_preset` is deliberately not, because the host locks a
  session's preset once a turn has started.

### Verified on real infrastructure

This is not a design sketch. It was exercised end to end against the real
decision endpoint and the real host modules (2026-11-19):

| Layer | Result |
|---|---|
| Targeted tests | `node --test test/spawn-model.test.js test/spawn-adapter.test.js` → **46/46 pass** |
| Full suite | `node --test test/` → **772/772 pass** |
| Real decision endpoint | SiliconFlow `systemone`, model `Kev-4B` → **HTTP 200**. For a verbatim-copy subtask the model chose the non-inherited route `r1` (`answers.route.choice = "r1"`, probability `r1 0.5881` vs `r0 0.4119`, `depth.score 0.3651`) |
| Real end-to-end switch | That real answer fed through the real `spec.parse`/`decide` and real adapter produced `agent.model.select({ provider: "qwenwork", model: "deepseek-flash", reasoningEffort: "low" })` — the child actually moved **from the lead's `modelscope-token-plan/Qwen/Qwen3.8-Flash-Next` to `qwenwork/deepseek-flash`**, with a reasoning effort set from the model's own published capabilities |

The captured answer is one measured sample, kept as evidence that the question
shape is accepted, the model really chooses among candidate routes, and the
choice reaches the child's model selection — not a promise that every task
picks the same route. (On demanding tasks the same model correctly chose to
inherit.)

## Features

**Nine decision points** (individually switchable; the subagent-model point is
the headline one above):

- tool authorization
- model routing
- delegation
- **subagent model selection** ← see above
- compaction
- turn continuation
- retrieval necessity
- skill selection
- COT translation gate

**Modes**: off · observe · enforce

**Providers**: system one · bamboonode · 硅基流动 SiliconFlow (CN / Global) ·
Perplexity · OpenRouter · custom base URL

**Review tolerance**: autonomous · relaxed · default · cautious

**UI**: config page with collapsible sections · Decisions tab · stats ·
readable approval card

| Config page | Decisions tab |
|---|---|
| ![config page](docs/assets/config-page.png) | ![decisions tab](docs/assets/decisions-tab.png) |

> Screenshots predate the collapsible-section layout (DEC-051).

**Token saving**: exact cache · read-only tools bypass · state trimming

**Reliability**: shadow by default · fail open on any error · timeout degrades ·
stats can be turned off

## License

MIT

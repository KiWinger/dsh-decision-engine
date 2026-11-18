// 英文版页面内容。结构与 content（build.mjs 中的中文段落）逐节对应，
// 章节 id 保持一致（#what / #install / #config / #points / #providers /
// #tokens / #failopen / #verify），中文页的锚点链接可以直接复用。
import { codeBlock, table, figure, fact, DECISION_ICON, FLATMAP_ICON, POCKETKIT_ICON } from "./partials.mjs";

// 页面不展示版本号：版本随时会更新，不显示以免挂旧号。

/* ------------------------------------------------------------------ *
 * Home (en)
 * ------------------------------------------------------------------ */

export const indexBodyEn = `
<div class="wrap hero">
  <span class="eyebrow"><span class="dot"></span> DeepSeek Harness plugin index</span>
  <h1>A small set of <span class="grad">plugins</span><br>for DeepSeek Harness</h1>
  <p class="lede">
    <strong>dsh.zuos.us</strong> collects DeepSeek Harness (DSH) plugins.
    All free, open source, MIT, ready to use — pick one below for its guide
    and install steps.
  </p>
</div>

<div class="wrap"><hr class="rule"></div>

<section class="wrap">
  <h2>Plugins</h2>
  <p class="sub">Three so far. Click a title to open its page.</p>

  <div class="projects">
    <a class="project" href="/en/dsh-decision-engine/">
      ${DECISION_ICON}
      <div>
        <h3>dsh-decision-engine</h3>
        <p>
          Before the main model acts, a cheap small model judges — allow, ask,
          block, switch to a cheaper model, or skip an expensive call. Eight
          decision points, individually switchable.
        </p>
        <div class="toc">
          <span class="badge green">Observe-only by default</span>
          <span class="badge blue">Any decision endpoint</span>
          <span class="badge gray">MIT</span>
        </div>
      </div>
      <span class="go">Read more →</span>
    </a>

    <a class="project" href="/en/dsh-model-flatmap/">
      ${FLATMAP_ICON}
      <div>
        <h3>dsh-model-flatmap</h3>
        <p>
          Replaces the model picker with one flat panel: every model, reasoning
          level and teamwork switch at once, no submenus, with search and grouping.
          The Settings page narrows the catalogue and renames providers, and a
          button hands back to the native style. Disabling restores the native control.
        </p>
        <div class="toc">
          <span class="badge green">Flat, no submenus</span>
          <span class="badge blue">Filterable · renamable</span>
          <span class="badge gray">MIT</span>
        </div>
      </div>
      <span class="go">Read more →</span>
    </a>

    <a class="project" href="/en/dsh-pocket-kit/">
      ${POCKETKIT_ICON}
      <div>
        <h3>dsh-pocket-kit</h3>
        <p>
          A pocket toolkit: independent small features in one plugin, each with its own
          switch on the Settings page, all on by default — switch one off and the native
          behaviour returns. Live today: the workspace directory picker pinned to the
          in-app browse backend (changing it takes a DSH restart), and recovery banners for
          prompts a failed turn swallowed.
        </p>
        <div class="toc">
          <span class="badge green">One switch per feature</span>
          <span class="badge blue">Off restores native</span>
          <span class="badge gray">MIT</span>
        </div>
      </div>
      <span class="go">Read more →</span>
    </a>
  </div>
</section>
`;

/* ------------------------------------------------------------------ *
 * Plugin page (en)
 * ------------------------------------------------------------------ */

const pointsTableEn = table(
  ["#", "Decision point", "Hook", "Trigger gate", "What it saves"],
  [
    [
      "1",
      "<strong>Tool authorization</strong>",
      "<code>tools/pre-execute</code>",
      "Read-only tools / auto presets / excluded tools pass straight through",
      "Replaces auto-review: ~60k tokens saved per call",
    ],
    [
      "2",
      "<strong>Model routing</strong>",
      "<code>agent/request</code>",
      "First N steps per turn only; skip if route unchanged or new user input",
      "~20–40% of main-channel tokens",
    ],
    [
      "3",
      "<strong>Subtask delegation</strong>",
      "<code>agent/pre-step</code>",
      "Only the first step of a turn, and only with new user input",
      "One avoided spawn = one whole context saved",
    ],
    [
      "4",
      "<strong>Subagent model</strong>",
      "<code>tools/pre-execute</code> → <code>agent/created</code>",
      "One judgement per spawn; skipped when the lead names a route explicitly or only one candidate exists",
      "The decision model picks the subagent's model and reasoning effort from host-authorized routes — no extra configuration",
    ],
    [
      "5",
      "<strong>Context compaction</strong>",
      "<code>agent/pre-step</code> → <code>ctx.compaction</code>",
      "Only when measured tokens reach 70% of the trigger line",
      "Skips one summarisation call",
    ],
    [
      "6",
      "<strong>Turn continuation</strong>",
      "<code>agent/turn-stopping</code>",
      "At most one steer per turn",
      "Avoids a wasted full turn",
    ],
    [
      "7",
      "<strong>Retrieval necessity</strong>",
      "<code>tools/pre-execute</code>",
      "Retrieval tools only; zero overhead for everything else",
      "Saves search and result tokens",
    ],
    [
      "8",
      "<strong>Skill selection</strong>",
      "<code>tools/pre-execute</code>",
      "Only the <code>skill</code> tool, and only with a non-empty candidate list",
      "Saves 2–5k per wrong load",
    ],
    [
      "9",
      "<strong>COT translation gate</strong>",
      "<code>cotTranslation.translate()</code>",
      "Local pre-filter + same-text cache",
      "Saves per-message translation calls",
    ],
  ]
);

const providersTableEn = table(
  ["Provider", "Default base URL", "Endpoint", "Key variable", "Default model"],
  [
    [
      "<code>system one</code>",
      "<code>https://api.typesafe.ai/v1</code>",
      "<code>/v1/systemone</code>",
      "<code>TYPESAFE_API_KEY</code>",
      "server default",
    ],
    [
      "<code>bamboonode</code>",
      "<code>https://api.bamboonode.dev/v1</code>",
      "<code>/v1/decisions</code>",
      "<code>BAMBOO_API_KEY</code>",
      "server default",
    ],
    [
      "<code>siliconflow</code><br><span class='badge gray'>CN site</span>",
      "<code>https://api.siliconflow.cn/v1</code>",
      "<code>/v1/systemone</code>",
      "<code>SILICONFLOW_API_KEY</code>",
      "<code>Kev-4B</code>",
    ],
    [
      "<code>siliconflow-intl</code><br><span class='badge gray'>intl site</span>",
      "<code>https://api.siliconflow.com/v1</code>",
      "<code>/v1/systemone</code>",
      "<code>SILICONFLOW_INTL_API_KEY</code>",
      "<code>Kev-4B</code>",
    ],
    [
      "<code>perplexity</code><br><span class='badge gray'>unverified</span>",
      "<code>https://api.perplexity.ai</code>",
      "auto (404 fallback)",
      "<code>PERPLEXITY_API_KEY</code>",
      "<code>sonar</code> (placeholder)",
    ],
    [
      "<code>openrouter</code><br><span class='badge gray'>unverified</span>",
      "<code>https://openrouter.ai/api/v1</code>",
      "auto (404 fallback)",
      "<code>OPENROUTER_API_KEY</code>",
      "<code>openai/gpt-4o-mini</code> (placeholder)",
    ],
    [
      "<code>custom</code>",
      "user-provided (required)",
      "per endpoint style",
      "<code>DECISION_ENGINE_CUSTOM_KEY</code>",
      "<code>customModel</code>",
    ],
  ]
);

const degradeTableEn = table(
  ["Situation", "Degradation code"],
  [
    ["Plugin disabled / read-only tool / auto preset / excluded", "no judgement, passes through"],
    ["No API key", "<code>no-key</code>"],
    ["Failure cooldown active", "<code>cooldown</code>"],
    ["Endpoint 4xx / 5xx", "<code>http-404</code> / <code>http-500</code> … (with endpoint, body)"],
    ["Network unreachable", "<code>network-error</code>"],
    ["Timeout", "<code>timeout</code> (with timeoutMs)"],
    ["Non-JSON / non-object response", "<code>invalid-json</code> / <code>invalid-response</code>"],
    ["Missing <code>answers</code> field", "<code>missing-answers</code>"],
    ["Provider unusable (e.g. invalid custom base URL)", "<code>invalid-base-url</code>"],
    ["Auth rejected (401/403)", "<code>auth-failed</code>"],
    ["Answer shape mismatch", "<code>answer-shape-mismatch</code>"],
    ["Caller aborted the request", "<code>caller-aborted</code>"],
  ]
);

export const pluginBodyEn = `
<div class="wrap hero">
  <span class="eyebrow"><span class="dot"></span> DeepSeek Harness plugin · MIT</span>
  <h1>dsh-decision-engine</h1>
  <p class="lede">
    Before the main model acts, a <strong>cheap small model</strong> answers four
    questions — <strong>risk, reversibility, task relevance, injection
    suspicion</strong> — and the result is to allow, ask, block, switch to a
    cheaper model, or skip an expensive call entirely. Defaults to
    <code>shadow</code>: record only, never interrupt.
  </p>
  <div class="cta-row">
    <a class="btn btn-primary" href="#install">Install</a>
    <a class="btn" href="#points">Nine decision points</a>
    <a class="btn" href="https://github.com/zuosus/dsh-decision-engine">GitHub</a>
  </div>
  ${codeBlock("dsh plugin add dsh-decision-engine")}
  <div class="toc">
    <a href="#what">What it is</a>
    <a href="#install">Install</a>
    <a href="#config">Configuration</a>
    <a href="#points">Decision points</a>
    <a href="#subagent">Subagent picks its model</a>
    <a href="#providers">Providers</a>
    <a href="#tokens">Token savings</a>
    <a href="#failopen">Fail-open</a>
    <a href="#verify">Verification</a>
  </div>
</div>

${figure("/assets/promo.jpeg", "dsh-decision-engine promo image", "A small model judges before the main model acts")}

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="what">
  <h2>What it is</h2>
  <p class="sub">
    A cheap <strong>judgement layer</strong>: one ~1.9k-token small-model call
    replacing or preventing far more expensive LLM work. All eight decision
    points are implemented and individually switchable.
  </p>

  <div class="stats">
    <div class="stat"><span class="n">9</span><span class="l">decision points, all implemented</span></div>
    <div class="stat"><span class="n">~1.9k</span><span class="l">tokens per decision</span></div>
    <div class="stat"><span class="n">0.5s</span><span class="l">p50 latency</span></div>
    <div class="stat"><span class="n">shadow</span><span class="l">default: record only</span></div>
  </div>

  ${figure("/assets/shot-config.png", "Config page: nine decision points with tri-state toggles", "Config page: each decision point has off / observe / enforce; edits save immediately")}

  <div class="facts">
    ${fact("Four questions", "Risk · reversibility · task relevance · injection suspicion. The answer is parsed into <code>allow</code> / <code>ask</code> / <code>deny</code>, plus swapping the model, injecting a hint, or skipping a retrieval where needed.")}
    ${fact("Subagents pick their own model", "When a subagent is spawned, the decision model picks its model and reasoning effort from the routes the host already authorizes — replacing the default that inherits the lead's route verbatim. No ladder to configure: the lead's current route is always among the candidates, so inheriting stays a valid answer.")}
    ${fact("Restrained", "Only replace a more expensive call, or prevent a bigger expense. Hot-path points all carry trigger gates — never a check for its own sake.")}
    ${fact("Any endpoint", "One request shape: <code>{ model, state, questions, think_mode }</code> in, <code>answers</code> out. Built-in provider presets, or any <code>custom</code> base URL.")}
  </div>

  <div class="note">
    <strong>Free channel.</strong> Toggle "use free model" to use the project's
    decision model with no key of your own; the quota is paid by the project and
    may be withdrawn or changed at any time — the UI says so plainly.
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="subagent">
  <h2>Headline feature: subagents pick their own model</h2>
  <p class="sub">
    This is the plugin's most important capability — even though in the UI it
    is just one of nine decision points.
  </p>

  <p class="sub">
    DeepSeek Harness normally gives a spawned subagent the <strong>exact same
    provider, model and reasoning effort as the lead</strong>. That default is
    only right when the lead is doing the same kind of work: sending research to
    a strong model wastes money, sending a high-fidelity refactor to a cheap
    tier buys a rewrite. Here the <strong>decision model picks a route itself</strong>
    from the ones already authorized — no ladder, no price table, no route list
    to configure.
  </p>

  <div class="facts">
    ${fact("Candidates you already have", "The session's <code>subagent/model-selection-policy</code> (routes you already authorized in DSH settings), falling back to the live <code>llm</code> adapter catalogue. Nothing new to configure in this plugin.")}
    ${fact("The model picks", "The endpoint accepts only choice / score / noul, so candidates become a <code>choice</code> question with short ids (r0…) mapped back to real routes. A malformed answer degrades to inheritance; the model cannot invent a non-existent route.")}
    ${fact("Inheritance stays valid", "The lead's current route is always a candidate (labelled as such), so “use what I'm using” is a legitimate answer, not a forced switch.")}
    ${fact("Effort from real capabilities", "Reasoning effort is chosen from the target model's own published <code>efforts</code>; if it publishes none the field is omitted rather than guessed — a guessed id fails the child spawn.")}
    ${fact("Explicit choice wins", "A provider/model passed in the delegation call, or set via <code>set_model</code>, outranks automatic judgement. The main agent gets <code>list_models</code> / <code>set_model</code> / <code>list_presets</code>; <code>switch_preset</code> is deliberately absent (the host locks a session's preset once a turn starts).")}
  </div>

  <h3>Verified on real infrastructure: the child actually switched models</h3>
  <p class="sub">Not a design sketch. Exercised end to end on 2026-11-19:</p>
  ${table(
    ["Layer", "Result"],
    [
      ["<code>node --test test/spawn-model.test.js test/spawn-adapter.test.js</code>", "Targeted tests <strong>46/46 pass</strong>; full suite <code>node --test test/</code> <strong>772/772 pass</strong>"],
      ["Real decision endpoint", "SiliconFlow <code>systemone</code> / <code>Kev-4B</code> → <strong>HTTP 200</strong>; for a verbatim-copy subtask the model chose the non-inherited <code>r1</code> (probability <code>r1 0.5881</code> vs <code>r0 0.4119</code>, <code>depth.score 0.3651</code>)"],
      ["Real end-to-end switch", "That real answer through the real <code>spec.parse/decide</code> and adapter produced <code>agent.model.select(&#123; provider: 'qwenwork', model: 'deepseek-flash', reasoningEffort: 'low' &#125;)</code> — the child <strong>really moved from the lead's <code>modelscope-token-plan/Qwen/Qwen3.8-Flash-Next</code> to <code>qwenwork/deepseek-flash</code></strong>, with reasoning effort set from the model's capabilities"],
    ]
  )}
  <div class="note">
    <strong>About the sample.</strong> This is one measured run: it proves the question shape is accepted, the model really chooses among candidates, and the choice reaches the child's model selection — not that every task switches. The same model correctly chose to inherit (r0) on demanding tasks, which is exactly the intended behaviour.
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="install">
  <h2>Install</h2>
  <p class="sub">From npm (recommended), or from source for local development.</p>

  ${codeBlock("dsh plugin add dsh-decision-engine")}
  <p class="sub">Or add it to a profile manually, then add <code>"dsh-decision-engine"</code> to <code>package.json</code> → <code>dsh.profile.bundles</code> and restart DSH:</p>
  ${codeBlock("cd ~/.dsh/profiles/desktop && pnpm add dsh-decision-engine")}

  <div class="facts">
    ${fact("No re-config", "On startup config and telemetry are auto-migrated into <code>~/.dsh/dsh-decision-engine/</code>, once only — later edits are never overwritten.")}
    ${fact("Local dev", "After <code>git clone</code>, run <code>node scripts/migrate-profile.mjs --write</code> (preview-only by default; <code>--write</code> applies with a backup).")}
    ${fact("Since 0.5.0", "Config file renamed from <code>startlux.yml</code> to <code>config.yml</code>; old files migrate automatically, no need to re-enter keys.")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="config">
  <h2>Configuration</h2>
  <p class="sub">
    Open <strong>Plugins → Installed → dsh-decision-engine</strong>; a Decision
    Engine card appears. Edits save immediately — no save button, no restart.
  </p>
  <div class="facts">
    ${fact("Tri-state", "<span class='badge gray'>off</span> sends no request; <span class='badge blue'>observe</span> judges and records what would have happened; <span class='badge green'>enforce</span> executes the outcome.")}
    ${fact("Key storage", "By default in the <code>refs:</code> section of <code>~/.dsh/.credentials.yaml</code> — no plaintext in the plugin dir — or self-contained in <code>config</code>. Each provider keeps its own slot.")}
    ${fact("Precedence", "Explicit key &gt; matching entry in storage &gt; environment variables. Switching providers flips one key; the others keep their saved values.")}
    ${fact("Model", "Dropdown fed live by <code>/v1/models</code>, default \"auto\" — the field is not sent, so a provider renaming its model cannot break your config.")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="points">
  <h2>Nine decision points</h2>
  <p class="sub">All implemented — you decide which ones the decision model joins. Hooks are implementation details.</p>
  ${pointsTableEn}

  ${figure("/assets/shot-decisions.png", "Decision history tab", "Decision history: every judgement, score and degradation is inspectable")}

  <div class="note">
    <strong>Why not switch every hook on:</strong> a decision costs ~1.9k tokens
    at p50 ≈ 0.5s, and <code>agent/pre-step</code> / <code>agent/request</code>
    fire every step. Hot-path points carry trigger gates and can never be called
    unconditionally.
  </div>

  <h3>Thresholds calibrated on real endpoints</h3>
  <p class="sub">Validated with paired samples ("should judge A" vs "should judge B"); a gate stayed only where the inputs separate. Three issues were fixed:</p>
  <div class="facts">
    ${fact("01 · confidence", "With three equally likely choices it is naturally 0.33, so the delegation floor is 0.5 (clearly above a uniform split), never 0.6 — or <code>advise</code> would be unreachable.")}
    ${fact("02 · wording", "Asking \"is this already known\" gave 0.30 / 0.12 (no separation); asking \"is it covered verbatim in recent\" gave 0.92 / 0.01.")}
    ${fact("03 · check order", "If turn continuation tests <code>closed</code> first, \"clearly unfinished\" falls through to the default <code>stop</code>; now <code>unfinished</code> is checked first.")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="providers">
  <h2>Providers: which decision service</h2>
  <p class="sub">
    The request shape is identical across providers; a response only needs
    <code>answers</code>. A provider decides exactly three things:
    <strong>where to send, whose key, which model by default</strong>.
  </p>
  ${codeBlock("POST <base>/decisions  or  POST <base>/systemone")}
  ${providersTableEn}

  <div class="note ok">
    <strong>Ready to use:</strong> <code>siliconflow</code> /
    <code>siliconflow-intl</code> need only one API key — base URL, path
    (<code>/systemone</code>) and default model (<code>Kev-4B</code>) are
    preconfigured. The two sites are separate accounts with separate keys.
  </div>

  <h3>The endpoint is decided by the provider, not the model</h3>
  <p class="sub">Verified on real endpoints with real keys (2026-10-25):</p>
  ${table(
    ["Provider", "Model", "<code>/v1/decisions</code>", "<code>/v1/systemone</code>"],
    [
      ["SiliconFlow", "<code>Kev-4B</code>", "<strong>404 Not Found</strong>", '<span class="badge green">200 ✓</span>'],
      ["bamboonode", "<code>startlux-decision-v1.1-27b-autothink</code>", '<span class="badge green">200 ✓</span>', '<span class="badge green">200 ✓</span>'],
    ]
  )}
  <p class="sub">
    So endpoint style is only the <strong>preferred</strong> path: send there
    first, on a <strong>404</strong> automatically retry the other one, and
    remember whichever worked (keyed by base URL). Only 404 triggers the switch
    — 400 / 401 / 5xx have nothing to do with the path, and switching would just
    burn another request.
  </p>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="tokens">
  <h2>Token-saving design</h2>
  <div class="facts">
    ${fact("Two-layer cache", "<strong>Exact</strong> reuses only when full state + question set match — the only layer on by default. <strong>Soft reuse</strong> drops argument content from its key, so it is off (fail-closed) and permanently disabled for authorization.")}
    ${fact("thinkMode", "Default <code>never</code> — measured effect is mainly latency (~1.9s vs 7.2s). <code>never</code> / <code>auto</code> / <code>always</code> switchable; illegal values normalize to <code>never</code>.")}
    ${fact("Trigger gates", "<code>read</code> / <code>grep</code> / <code>glob</code> / <code>todo_write</code> and friends never send a request. State is truncated: <code>recent</code> carries only the last 4 entries at 240 chars each.")}
    ${fact("Cooldown", "3 consecutive failures → 60s off; inside cooldown calls pass through in 0ms. Each request has a hard timeout (default 8000ms; measured p50 ≈ 0.7s, cold-start p95 ≈ 6.4s).")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="failopen">
  <h2>Fail-open degradation</h2>
  <p class="sub">
    <strong>Any uncertainty falls back to native behavior</strong> — a guard
    failure must never wedge a tool call. All cases below pass through and
    record one <code>action=degraded</code> line in
    <code>telemetry.jsonl</code>.
  </p>
  ${degradeTableEn}
  <div class="note ok">In default <code>shadow</code> mode, even a judged <code>deny</code> is only recorded, never executed.</div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="verify">
  <h2>Verification</h2>
  <p class="sub">Three automated acceptance runs — all repeatable.</p>
  ${codeBlock("pnpm test && pnpm verify:wiring && pnpm verify:endpoint")}
  ${table(
    ["Command", "Covers"],
    [
      ["<code>pnpm test</code>", "Unit tests: pure functions + adapter wiring + providers + config round-trip + settings UI rendering + cache regressions"],
      ["<code>pnpm verify:wiring</code>", "Loads the plugin with the real schemastery and confirms the host provides the service"],
      ["<code>pnpm verify:endpoint</code>", "Hits the real endpoint once per decision point, validating question shape and answer parsing"],
    ]
  )}
  <div class="note warn">
    <strong>Do not skip <code>verify:endpoint</code>.</strong> A malformed
    question type 400s at runtime and degrades silently — from the logs alone it
    is nearly impossible to notice "this point never actually worked".
  </div>

  <h3>Reading one record</h3>
  <p class="sub">Switch a point to observe, trigger its action, then read <code>~/.dsh/dsh-decision-engine/telemetry.jsonl</code>:</p>
  <div class="facts">
    ${fact("detail", "<code>no-key</code> → key not found; <code>http-404</code> / <code>http-400</code> → wrong URL or model; <code>answer-shape-mismatch</code> → question set needs a second look.")}
    ${fact("point", "<code>point=route, action=switch</code> means \"this step should sink to a cheaper model\". Every line carries its <code>point</code> and raw <code>scores</code>.")}
    ${fact("Data dir", "<code>$DSH_HOME/dsh-decision-engine/</code>; <code>~/.dsh</code> is only the fallback. Blank counts as unset, <code>~</code> expansion works, relative paths normalize to absolute.")}
  </div>
</section>
`;

/* ------------------------------------------------------------------ *
 * flatmap plugin page (en)
 * ------------------------------------------------------------------ */

export const flatmapBodyEn = `
<div class="wrap hero">
  <span class="eyebrow"><span class="dot"></span> DeepSeek Harness plugin · MIT</span>
  <h1>dsh-model-flatmap</h1>
  <p class="lede">
    Replaces the composer model picker with <strong>one flat panel</strong>:
    every model, reasoning level and teamwork switch on the same surface,
    visible at once — no nested popovers. Search, grouping and theme-awareness
    all live in that one panel; Settings narrows the catalogue, renames providers
    and hands back to the native style, and an optional anonymous-usage toggle
    is built in.
  </p>
  <div class="cta-row">
    <a class="btn btn-primary" href="#install">Install</a>
    <a class="btn" href="#what">What it is</a>
    <a class="btn" href="https://github.com/zuosus/dsh-model-flatmap">GitHub</a>
  </div>
  <div class="toc">
    <a href="#what">What it is</a>
    <a href="#features">Features</a>
    <a href="#settings">Settings</a>
    <a href="#install">Install</a>
    <a href="#layout">Layout</a>
    <a href="#dev">Development</a>
  </div>
</div>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="what">
  <h2>What it is</h2>
  <p class="sub">
    A <strong>client-side</strong> DSH plugin that works in both the Web GUI and
    the Desktop app. It swaps the composer's <code>conversation.input.model</code>
    control for a searchable flat grid; the thin host half only sends the optional
    anonymous heartbeat and answers two trust-fenced helper routes.
  </p>

  <div class="stats">
    <div class="stat"><span class="n">0</span><span class="l">submenus</span></div>
    <div class="stat"><span class="n">320px</span><span class="l">panel height cap</span></div>
    <div class="stat"><span class="n">2</span><span class="l">grouping modes</span></div>
    <div class="stat"><span class="n">shadow</span><span class="l">disabling restores native</span></div>
  </div>

  ${figure("/assets/shot-flatmap.jpeg", "The flat model picker in action", "The panel: model grid, reasoning levels and teamwork switch on one surface")}

  <div class="facts">
    ${fact("One surface", "The trigger opens one panel capped at 320px. Header, reasoning row and teamwork row stay fixed; only the model grid scrolls — see everything at once instead of drilling through popovers.")}
    ${fact("Public APIs · thin host", "The panel reads and writes through public Client APIs only — the per-Session model directory, teamwork setting and host locale — and shadows the native <code>ModelSelect</code> with a negative priority. The host half contributes no service, tool or event; it only sends the optional anonymous heartbeat and answers two helper routes.")}
    ${fact("Disable to restore", "Turning the bundle off touches no native control and restores <code>ModelSelect</code> with no residue. Plain ES modules, no build step.")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="features">
  <h2>Features</h2>
  <p class="sub">No nested submenus — instead, one searchable, groupable, theme-aware surface.</p>
  <div class="facts">
    ${fact("Search", "Across every provider and family; empty groups are dropped, so no stray headings. Ranking: prefix &gt; substring &gt; ordered character matches. Whitespace splits the query into tokens, every one must land in the name; a query matching a provider (id / catalog name / section label) keeps its entire catalogue.")}
    ${fact("Two groupings · families", "A segment control switches between By provider and By family, independent of search. Dictionary recognises DeepSeek, Claude, Qwen, GPT and more; registered brands split by generation (HY3 / HY4 / HY), unrecognised models infer from their id, anything unjudgeable falls into Others (always last). Families stay flat.")}
    ${fact("Native labels, row for row", "The trigger and every By-provider row render the native picker's own <code>conversation.input.model.label</code> slot — promotions, rate multipliers and load marks exactly as in the stock menu. By-family rows keep their quieter model tail, and a crashing decoration falls back to the catalog name.")}
    ${fact("Reasoning · teamwork", "Reasoning levels render as an exclusive, keyboard-operable group (radio semantics); they share a line with the teamwork switch when it fits, else wrap. If the Host's Team services are not mounted, the teamwork row stays visible but disabled with a hint — it never silently disappears.")}
    ${fact("'Default style' native mode", "The bottom-right button <strong>steps aside</strong> (disposes its own registration) to hand the seat back to the host's real shipped <code>ModelSelect</code>, so it is always the installed DSH's latest picker. The way back is a distinct full-width outlined action at the bottom of that picker's own menu; the choice survives reloads. With no picker to hand to, the button stays disabled and the panel stays.")}
    ${fact("Project link button", "A link icon beside 'Default style' opens the project's GitHub page in a new tab, with the URL derived from the checkout's <code>git remote -v</code> (non-GitHub hosts skipped, project home as fallback). Prefetched on panel open, so the click is a synchronous <code>window.open</code> a popup blocker won't eat.")}
    ${fact("Strike-through, global & 24h", "A model whose call failed on insufficient balance is struck through <strong>across all sessions and workspaces</strong> and persisted to localStorage; a later successful call or 24 hours without a new attempt clears it. A 429 is judged by its body, so a genuine rate limit never strikes.")}
    ${fact("Theme-aware · no build", "Styled with host theme tokens only, correct in light and dark; plain ES modules. Tests read <code>client.js</code> directly and drive the real component to catch crashes, missing sections and wrong column counts.")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="settings">
  <h2>Settings · Model list</h2>
  <p class="sub">In Settings → Model list you can narrow the catalogue to what you actually pick from, and give providers names you remember.</p>
  <div class="facts">
    ${fact("Show / hide", "Every provider and every model has a switch; the provider switch is a <strong>bulk action</strong> that still leaves per-model exceptions live (turn a group off, then switch the two or three you want back on). The record stores only what is hidden, so newly installed providers appear automatically; a change re-renders open panels immediately. If everything is hidden the panel points back to Settings instead of claiming no models are available.")}
    ${fact("Provider aliases", "Rename a provider from the pencil on its row (Enter to save, Esc to cancel, one-click restore), keyed by its stable id. One label derivation drives group headings, By-family row text, tooltips and search; routing, selection and the native style keep the catalog name, which stays searchable.")}
    ${fact("Rows like the picker's", "Settings model rows reuse the picker's naming grammar: a <code>· x0.01</code> multiplier is lifted into a smaller bold run and the catalog's badge chip (promotion / load / rate) follows the name; out-of-balance models are flagged in text under the name, and a provider is flagged when every one of its models is out.")}
    ${fact("Seat-conflict diagnosis", "When another plugin steals the model seat, Settings names the competitor and offers an idempotent Force repair; if 'Default style' is greyed out it explains that the picker underneath can't host the return action. It says plainly when the seat can't be fixed in place. The catalogue is force re-read on every open and refreshed when the Host announces a provider, model, setting or credential change.")}
    ${fact("Anonymous usage statistics", "The host sends at most one anonymous heartbeat a day, containing only install id, version, platform and architecture — <strong>never prompts, models or paths</strong>. The bottom of this page has an 'Anonymous usage statistics' toggle (on by default) that the host honours on its next send with no restart; deleting <code>analytics.json</code> gives the machine a fresh id.")}
    ${fact("Teamwork default", "The 'Enable agent teamwork' toggle sets the default for <strong>new sessions</strong> (off by default), deliberately separate from the panel's per-session switch so changing one never writes the other.")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="install">
  <h2>Install</h2>
  <p class="sub">This package is a DSH <strong>bundle</strong>. Install it from the plugin manager, or drop it into the profile's bundle directory.</p>
  ${codeBlock("dsh plugin add dsh-model-flatmap")}
  <p class="sub">Or copy it into a profile manually (paths vary by install):</p>
  ${codeBlock('cp -r . "<profile>/bundles/dsh-model-flatmap"')}
  <div class="note ok">
    <strong>Disable to restore.</strong> Enable/disable from the plugin list;
    the <code>dsh</code> loader reads <code>cordis.patch.yml</code> to mount it,
    and turning it off restores the native control with no residue.
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="layout">
  <h2>Project layout</h2>
  <p class="sub">The plugin is light: all of the UI lives in <code>client.js</code>; the host half only sends the heartbeat and answers two helper routes.</p>
  ${table(
    ["Path", "Purpose"],
    [
      ["<code>index.js</code>", "Host half — bundle entry; optional anonymous daily heartbeat and two helper routes."],
      ["<code>telemetry.js</code>", "The heartbeat: pure day/decision functions plus an injectable reporter."],
      ["<code>repo-url.js</code>", "Derives the project link from the checkout's git remote."],
      ["<code>client.js</code>", "Browser half — the entire flat picker UI and the Settings → Model list page."],
      ["<code>cordis.patch.yml</code>", "Cordis patch applied by the <code>dsh</code> bundle loader."],
      ["<code>locale/en.json</code> / <code>locale/zh.json</code>", "English / Simplified-Chinese copy and metadata."],
      ["<code>docs/DETAIL.md</code>", "Detailed behaviour specification."],
      ["<code>test/</code>", "Render-path tests driven through a minimal hook runtime."],
    ]
  )}
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="dev">
  <h2>Development</h2>
  <p class="sub">Plain ES modules, no build step.</p>
  ${codeBlock("node --test test/")}
  <p class="sub">
    The full behaviour spec is in <a href="https://github.com/zuosus/dsh-model-flatmap/blob/main/docs/DETAIL.md">docs/DETAIL.md</a>,
    and the design decisions in <a href="https://github.com/zuosus/dsh-model-flatmap/blob/main/DECISIONS.md">DECISIONS.md</a>.
  </p>
</section>
`;


/* ------------------------------------------------------------------ *
 * pocket-kit 插件页（英文）
 * ------------------------------------------------------------------ */

export const pocketkitBodyEn = `;
<div class="wrap hero">
  <span class="eyebrow"><span class="dot"></span> DeepSeek Harness plugin · MIT</span>
  <h1>dsh-pocket-kit</h1>
  <p class="lede">
    A <strong>pocket toolkit</strong>: independent small features in one plugin, each with
    its own switch on the Settings page — all on by default, and switching one off brings
    the native behaviour straight back. Two are live: pinning the workspace directory
    picker to the in-app browse backend (changing it takes a DSH restart), and recovering the
    prompt a failed turn swallowed (restore / copy / dismiss).
  </p>
  <div class="cta-row">
    <a class="btn btn-primary" href="#install">Install</a>
    <a class="btn" href="#what">What it is</a>
    <a class="btn" href="https://github.com/zuosus/dsh-pocket-kit">GitHub</a>
  </div>
  <div class="toc">
    <a href="#what">What it is</a>
    <a href="#features">Features</a>
    <a href="#install">Install</a>
    <a href="#layout">Layout</a>
    <a href="#dev">Development</a>
  </div>
</div>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="what">
  <h2>What it is</h2>
  <p class="sub">
    Not a single-purpose plugin but a <strong>collection</strong>: the host installs the
    enabled features from the <code>lib/features/</code> registry, and the client ships a
    Pocket Kit settings page — one switch per registry row, all volatile (no config file is
    touched). Recovery switches take effect immediately; the picker is decided at boot, so a
    change there takes effect after you restart DSH.
  </p>

  <div class="stats">
    <div class="stat"><span class="n">2</span><span class="l">features live</span></div>
    <div class="stat"><span class="n">1</span><span class="l">switch per feature</span></div>
    <div class="stat"><span class="n">1</span><span class="l">switch needing a restart</span></div>
    <div class="stat"><span class="n">3</span><span class="l">steps to add a feature</span></div>
  </div>

  <div class="facts">
    ${fact("Mutually independent", "No feature depends on another: switch one off and the rest keep working; switch all off and behaviour is exactly as if the plugin were not installed.")}
    ${fact("Two delivery halves", "<code>cordis.patch.yml</code> pins the boot composition (the directory picker); <code>lib/index.js</code> plus <code>lib/client.js</code> are a normal Host + Client plugin row — the client adds the settings page and the recovery banner.")}
    ${fact("No config files rewritten", "Switches are volatile — stored in Settings, never written to disk. The picker's Host backend and Client surface are mounted as a pair at boot, so a change there takes effect at the next DSH restart.")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="features">
  <h2>Features</h2>

  <h3>inputRecovery — recover a swallowed prompt</h3>
  <p class="sub">
    A prompt is recorded twice on its way into a turn: the inbox insert when the browser
    sends it, and the claim when the running turn takes it. The bubble in the transcript
    is a third event — <code>user/message</code> — logged only after turn processing
    starts. When a turn dies before that point (a plugin throws during tool wiring, the
    provider explodes on the first step, the process exits mid-turn), the log holds the
    claim and the failure but never the message: the input is gone from the UI while
    sitting, intact, in the session log.
  </p>
  <div class="facts">
    ${fact("Event feed", "The host watches the live <code>session/event</code> feed, remembers which human messages the inbox inserted and which one the turn claimed, and when a turn ends in <code>error</code> / <code>interrupted</code> / <code>aborted</code> without the claimed message ever being logged, it stores the text plus the failure reason.")}
    ${fact("Survives restarts", "Records persist under <code>~/.dsh/dsh-pocket-kit/recovered-input.json</code>, so a host restart does not drop a pending one.")}
    ${fact("Three actions", "A banner above the composer offers <strong>Put it back</strong> (restores the real draft through the session input actions, undo stack included), <strong>Copy</strong> (clipboard fallback) and <strong>Dismiss</strong>.")}
  </div>
  <p class="sub">The page reads through two same-origin routes, fenced with the same Host/Origin plus login-cookie check the open-in-app routes rely on:</p>
  ${codeBlock("GET  /dsh-pocket-kit/recovered-input?session=<id>")}
  ${codeBlock("POST /dsh-pocket-kit/recovered-input/ack   { session, ids }")}

  <h3>pinBrowsePicker — a pinned directory picker</h3>
  <p class="sub">
    "Add workspace" hands the flow to whichever backend occupies the workspace
    <code>directoryFlow</code> slot. The stock auto selector samples the host once per
    boot: a non-loopback trusted authority, a non-loopback bind address, or an SSH
    session pick the in-app <code>browse</code> panel; macOS / Windows, or a Linux with a
    display, pick the native system panel. Because the sample happens only at boot, a
    proxy rewriting the bind or authority facts, a Clash fake-ip, or a different SSH
    launch flips the outcome — Finder opens where the built-in browser used to.
  </p>
  <div class="facts">
    ${fact("Switch on (default)", "The patch disables the auto row and composes the browse backend plus its client surface directly: the picker is always the in-app panel.")}
    ${fact("Switch off", "The stock auto selector is remounted at boot — exactly the behaviour you would get without this plugin. Takes a DSH restart; no config file touched, the setting is volatile.")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="install">
  <h2>Install</h2>
  <p class="sub">A DSH <strong>bundle</strong>, installed by local link (not published to npm):</p>
  <div class="facts">
    ${fact("1 · dependency", "In <code>~/.dsh/profiles/&lt;profile&gt;/package.json</code> add to <code>dependencies</code>: <code>&quot;dsh-pocket-kit&quot;: &quot;link:/path/to/dsh-pocket-kit&quot;</code>.")}
    ${fact("2 · bundles", "Add <code>&quot;dsh-pocket-kit&quot;</code> to <code>dsh.profile.bundles</code> in the same file.")}
    ${fact("3 · install + restart", "Run <code>npm install</code> in the profile directory (or drop a symlink into its <code>node_modules/</code>), then restart DSH.")}
  </div>
  <div class="note ok">
    <strong>No restart for the recovery switch after install.</strong> The bundled
    <code>cordis.patch.yml</code> pins the browse picker at boot: that switch is decided at
    startup, so changing it takes a DSH restart; the other feature switches are volatile and
    take effect without one.
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="layout">
  <h2>Layout</h2>
  <p class="sub">One module per feature; one registry; one config declaration.</p>
  ${table(
    ["Path", "Purpose"],
    [
      ["<code>lib/index.js</code>", "Host entry — Config declaration, installs enabled features."],
      ["<code>lib/features/index.js</code>", "The host-side <code>FEATURES</code> registry."],
      ["<code>lib/features/input-recovery.js</code>", "Prompt recovery: feed watcher, store, routes."],
      ["<code>lib/features/pin-browse-picker.js</code>", "Runtime mount/unmount of the picker pin."],
      ["<code>lib/client.js</code>", "Client half — settings page and the recovery banner."],
      ["<code>cordis.patch.yml</code>", "Boot-composition patch pinning the browse picker."],
      ["<code>locale/en.json</code> / <code>locale/zh.json</code>", "English / Simplified-Chinese copy and metadata."],
      ["<code>test/</code>", "Suites driven through a minimal hook runtime."],
      ["<code>docs/DETAIL.md</code>", "Detailed behaviour specification."],
    ]
  )}
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="dev">
  <h2>Development</h2>
  <p class="sub">Plain ES modules, no build step.</p>
  ${codeBlock("npm test")}
  <p class="sub">
    Seven suites (host / config / client / render / banner / pin-switch / resolve), all
    green in the local checkout (2026-11-19). Adding a feature takes three steps: export
    <code>apply(ctx, enabled)</code> from <code>lib/features/&lt;id&gt;.js</code>, add one row to
    each <code>FEATURES</code> registry (host and client), and add
    <code>z.boolean().default(true).volatile()</code> to <code>Config</code> — the settings
    page picks the new switch up from the schema, so no page code needs editing.
  </p>
  <p class="sub">
    The full behaviour specification is in
    <a href="https://github.com/zuosus/dsh-pocket-kit/blob/main/docs/DETAIL.md">docs/DETAIL.md</a>.
  </p>
</section>
`;

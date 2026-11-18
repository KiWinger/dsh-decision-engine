// 把站点源文件渲染成 dist/ 下的静态文件。运行：node site/build.mjs
import { mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nav, footer, codeBlock, table, figure, fact, DECISION_ICON, FLATMAP_ICON, POCKETKIT_ICON, esc } from "./lib/partials.mjs";
import { indexBodyEn, pluginBodyEn, flatmapBodyEn, pocketkitBodyEn } from "./lib/content-en.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, "dist");
// 页面不展示版本号：版本随时会更新，写死/读取都会立刻漂移，索性不显示。
const ORIGIN = "https://dsh.zuos.us";

// 顶部导航不列举插件：插件入口在首页的索引卡片里。
// 这里只放站点级链接（GitHub）；各插件子页另有返回首页的链接。
function navLinksFor() {
  return [{ href: "https://github.com/zuosus", label: "GitHub" }];
}

/**
 * @param opts
 *   lang     <html lang>
 *   self     本页路径（canonical 用）
 *   alt      另一语言版本 { path, label }，渲染成导航语言按钮 + hreflang
 */
function page(title, description, body, { lang = "zh-CN", self = "/", alt = null } = {}) {
  const locale = lang.startsWith("zh") ? "zh" : "en";
  // 首页有中英两条路径（/ 与 /en/），都不该自链返回首页。
  const isHome = self === "/" || self === "/en/";
  const canonical = ORIGIN + self;
  const altHref = alt ? ORIGIN + alt.path : null;
  const hreflang = alt
    ? `<link rel="alternate" hreflang="${locale === "zh" ? "en" : "zh-CN"}" href="${altHref}">
<link rel="alternate" hreflang="${lang}" href="${canonical}">
<link rel="alternate" hreflang="x-default" href="${canonical}">`
    : "";
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
${hreflang}
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f5f7fa">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0e14">
<link rel="icon" href="/assets/mascot.png" type="image/png">
<link rel="stylesheet" href="/assets/style.css">
<script src="/assets/theme.js"></script>
</head>
<body>
${nav({
    brand: "dsh.zuos.us",
    links: [
      // 只有插件子页需要返回首页；首页本身就是索引，不必自链。
      ...(isHome ? [] : [{ href: locale === "zh" ? "/" : "/en/", label: locale === "zh" ? "返回首页" : "Back to home" }]),
      ...navLinksFor(),
    ],
    i18n: alt ? { href: alt.path, label: alt.label, hreflang: locale === "zh" ? "en" : "zh-CN" } : null,
    themeAria: locale === "zh" ? "切换主题" : "Toggle theme",
  })}
<main>
${body}
</main>
${footer()}
<script src="/assets/app.js" defer></script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ *
 * 首页：项目列表
 * ------------------------------------------------------------------ */

const indexBody = `
<div class="wrap hero">
  <span class="eyebrow"><span class="dot"></span> DeepSeek Harness 插件索引</span>
  <h1>给 <span class="grad">DeepSeek Harness</span><br>做的一小把插件</h1>
  <p class="lede">
    这里是 <strong>dsh.zuos.us</strong> 收录的 DeepSeek Harness（DSH）插件。
    都免费、开源、MIT，装上就能用；下面挑一个看详细介绍与安装方式。
  </p>
</div>

<div class="wrap"><hr class="rule"></div>

<section class="wrap">
  <h2>收录的插件</h2>
  <p class="sub">目前 3 个。点标题进入各自的介绍页。</p>

  <div class="projects">
    <a class="project" href="/dsh-decision-engine/">
      ${DECISION_ICON}
      <div>
        <h3>dsh-decision-engine</h3>
        <p>
          主模型动手前，用一个便宜的小模型做判断，决定放行、询问、拦截，
          或换便宜模型、跳过一次昂贵调用。九个决策点逐个可切换，派生子代理时还由决策模型自己挑模型。
        </p>
        <div class="toc">
          <span class="badge green">默认只观察</span>
          <span class="badge blue">接任意决策端点</span>
          <span class="badge gray">MIT</span>
        </div>
      </div>
      <span class="go">查看介绍 →</span>
    </a>

    <a class="project" href="/dsh-model-flatmap/">
      ${FLATMAP_ICON}
      <div>
        <h3>dsh-model-flatmap</h3>
        <p>
          把模型选择器换成一块平铺面板：所有模型、推理等级与协作开关一次看完，
          没有二级菜单，支持搜索与分组；设置页还能隐藏不用的 Provider / 模型、自定义名称，
          一键切回宿主原生样式。关闭即复原原生控件。
        </p>
        <div class="toc">
          <span class="badge green">平铺无二级菜单</span>
          <span class="badge blue">可筛选 · 可改名</span>
          <span class="badge gray">MIT</span>
        </div>
      </div>
      <span class="go">查看介绍 →</span>
    </a>

    <a class="project" href="/dsh-pocket-kit/">
      ${POCKETKIT_ICON}
      <div>
        <h3>dsh-pocket-kit</h3>
        <p>
          口袋工具箱：一组互相独立的小功能装进同一个插件，每个功能在设置页有各自的开关
          （默认全开，关掉即回原生）。已实装两件——目录选择器钉在应用内 browse 面板
          （改动需重启 DSH 生效），以及失败轮次吞掉输入的找回横幅（放回 / 复制 / 忽略）。
        </p>
        <div class="toc">
          <span class="badge green">逐功能独立开关</span>
          <span class="badge blue">关掉即还原原生</span>
          <span class="badge gray">MIT</span>
        </div>
      </div>
      <span class="go">查看介绍 →</span>
    </a>
  </div>
</section>
`;

/* ------------------------------------------------------------------ *
 * 插件页
 * ------------------------------------------------------------------ */

const pointsTable = table(
  ["#", "决策点", "挂载位置", "触发闸", "省什么"],
  [
    [
      "1",
      "<strong>工具授权</strong>",
      "<code>tools/pre-execute</code>",
      "只读工具 / auto 预设 / 排除名单直接放行",
      "替代 auto-review：每次约省 60k token",
    ],
    [
      "2",
      "<strong>模型路由</strong>",
      "<code>agent/request</code>",
      "每轮仅前 N 步 + 路由未变不问 + 新用户输入不问",
      "主通道约省 20–40% token",
    ],
    [
      "3",
      "<strong>子任务分派</strong>",
      "<code>agent/pre-step</code>",
      "仅每轮第一步且带新用户输入",
      "少开一个 subagent = 省一整个上下文",
    ],
    [
      "4",
      "<strong>子代理模型</strong>",
      "<code>tools/pre-execute</code> → <code>agent/created</code>",
      "每次派生只问一次；lead 显式指定、或候选只有当前路由时不问",
      "决策模型在宿主已授权路由里自己挑模型与推理强度，无需配置",
    ],
    [
      "5",
      "<strong>上下文压缩</strong>",
      "<code>agent/pre-step</code> → <code>ctx.compaction</code>",
      "仅实测 token 达触发线 ×70%",
      "省掉一次摘要调用",
    ],
    [
      "6",
      "<strong>轮次延续</strong>",
      "<code>agent/turn-stopping</code>",
      "同一轮最多续一次",
      "避免空转一整轮",
    ],
    [
      "7",
      "<strong>检索必要性</strong>",
      "<code>tools/pre-execute</code>",
      "仅检索类工具；其余工具零开销",
      "省搜索与结果 token",
    ],
    [
      "8",
      "<strong>技能选择</strong>",
      "<code>tools/pre-execute</code>",
      "仅 <code>skill</code> 工具且候选非空",
      "省 2–5k / 次误加载",
    ],
    [
      "9",
      "<strong>思维链翻译门槛</strong>",
      "<code>cotTranslation.translate()</code>",
      "本地预筛 + 同文本缓存",
      "按条省翻译调用",
    ],
  ]
);

const providersTable = table(
  ["Provider", "默认地址", "端点", "密钥变量名", "默认模型"],
  [
    [
      "<code>system one</code>",
      "<code>https://api.typesafe.ai/v1</code>",
      "<code>/v1/systemone</code>",
      "<code>TYPESAFE_API_KEY</code>",
      "服务端默认",
    ],
    [
      "<code>bamboonode</code>",
      "<code>https://api.bamboonode.dev/v1</code>",
      "<code>/v1/decisions</code>",
      "<code>BAMBOO_API_KEY</code>",
      "服务端默认",
    ],
    [
      "<code>siliconflow</code><br><span class='badge gray'>国内站</span>",
      "<code>https://api.siliconflow.cn/v1</code>",
      "<code>/v1/systemone</code>",
      "<code>SILICONFLOW_API_KEY</code>",
      "<code>Kev-4B</code>",
    ],
    [
      "<code>siliconflow-intl</code><br><span class='badge gray'>国际站</span>",
      "<code>https://api.siliconflow.com/v1</code>",
      "<code>/v1/systemone</code>",
      "<code>SILICONFLOW_INTL_API_KEY</code>",
      "<code>Kev-4B</code>",
    ],
    [
      "<code>custom</code>",
      "用户填写（必填）",
      "按端点风格拼",
      "<code>DECISION_ENGINE_CUSTOM_KEY</code>",
      "<code>customModel</code>",
    ],
  ]
);

const degradeTable = table(
  ["情形", "降级码"],
  [
    ["插件未启用 / 只读工具 / auto 预设 / 被排除", "不判断，直接放行"],
    ["没有 API key", "<code>no-key</code>"],
    ["命中失败冷却", "<code>cooldown</code>"],
    ["端点 4xx / 5xx", "<code>http-404</code> / <code>http-500</code> 等（附 endpoint、body）"],
    ["网络不可达", "<code>network-error</code>"],
    ["超时", "<code>timeout</code>（附 timeoutMs）"],
    ["返回非 JSON / 非对象", "<code>invalid-json</code> / <code>invalid-response</code>"],
    ["缺 <code>answers</code> 字段", "<code>missing-answers</code>"],
    ["provider 配置不可用（如 custom base URL 非法）", "<code>invalid-base-url</code>"],
    ["鉴权被拒（401/403）", "<code>auth-failed</code>"],
    ["答案形状不符", "<code>answer-shape-mismatch</code>"],
    ["调用方中止", "<code>caller-aborted</code>"],
  ]
);

const pluginBody = `
<div class="wrap hero">
  <span class="eyebrow"><span class="dot"></span> DeepSeek Harness 插件 · MIT</span>
  <h1>dsh-decision-engine</h1>
  <p class="lede">
    主模型动手前，先让一个<strong>便宜的小模型</strong>回答四个问题——
    <strong>风险、可逆性、任务相关性、注入嫌疑</strong>——再决定放行、询问、
    拦截，或者换个便宜模型、干脆跳过这次昂贵调用。默认 <code>shadow</code>：
    只记录，不打断。
  </p>
  <div class="cta-row">
    <a class="btn btn-primary" href="#install">安装</a>
    <a class="btn" href="#points">九个决策点</a>
    <a class="btn" href="https://github.com/zuosus/dsh-decision-engine">GitHub</a>
  </div>
  ${codeBlock("dsh plugin add dsh-decision-engine")}
  <div class="toc">
    <a href="#what">它是什么</a>
    <a href="#install">安装</a>
    <a href="#config">配置</a>
    <a href="#points">决策点</a>
    <a href="#subagent">子代理自选模型</a>
    <a href="#providers">Provider</a>
    <a href="#tokens">省 token</a>
    <a href="#failopen">失败降级</a>
    <a href="#verify">验证</a>
  </div>
</div>

${figure("/assets/promo.jpeg", "dsh-decision-engine 宣传图", "主模型动手前，先用一个小模型做判断")}

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="what">
  <h2>它是什么</h2>
  <p class="sub">
    一个便宜的<strong>判断层</strong>：一次约 1.9k token 的小模型调用，
    去替代或阻止更贵的 LLM 开销。九个决策点全部实装，逐个可切换。
  </p>

  <div class="stats">
    <div class="stat"><span class="n">9</span><span class="l">个决策点，全部实装</span></div>
    <div class="stat"><span class="n">~1.9k</span><span class="l">token / 次决策</span></div>
    <div class="stat"><span class="n">0.5s</span><span class="l">p50 延迟</span></div>
    <div class="stat"><span class="n">shadow</span><span class="l">默认只记录不生效</span></div>
  </div>

  ${figure("/assets/shot-config.png", "配置页：九个决策点逐个切换三态", "配置页：每个决策点有 关闭 / 观察 / 生效 三态，改完即保存")}

  <div class="facts">
    ${fact("四个问题", "风险 · 可逆性 · 任务相关性 · 注入嫌疑。答案被解析成 <code>allow</code> / <code>ask</code> / <code>deny</code>，需要时还能替换模型、注入提示、跳过一次检索。")}
    ${fact("子代理自己挑模型", "派生 subagent 时，决策模型在宿主已授权的路由里自己挑一个模型与推理强度，取代「原样继承 lead」的默认行为；用户不必为它再配一张阶梯表。候选里始终含 lead 当前路由，所以「继承」永远是合法选项。")}
    ${fact("克制的介入", "只在「替代更贵的调用」或「阻止更大的开销」处介入；热路径上的点都带触发闸，绝不为了多一道检查而介入。")}
    ${fact("接任意端点", "请求只有一个形状：<code>{ model, state, questions, think_mode }</code> 发过去，拿回 <code>answers</code>。内置多个 provider 预设，也能填任意 <code>custom</code> base URL。")}
  </div>

  <div class="note">
    <strong>免费通道。</strong>打开「使用免费模型」即可用项目方提供的决策模型，
    不用自己填 key；额度由项目方承担，随时可能停用或调整，界面上会直说这个风险。
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="subagent">
  <h2>重大功能：子代理自己挑模型</h2>
  <p class="sub">
    这是本插件最值得单独讲的一项能力——尽管它在界面上只是九个判断点之一。
  </p>

  <p class="sub">
    DeepSeek Harness 默认让派生出的子代理<strong>原样继承 lead 的 provider / model / 推理强度</strong>。
    这个默认值只在「lead 自己也在做同类工作」时才对：把调研交给强模型是浪费，把高保真重构交给便宜档是返工。
    本插件让<strong>决策模型自己在已授权路由里挑一个</strong>——不需要你配阶梯、填价格表或再配一遍路由。
  </p>

  <div class="facts">
    ${fact("候选来自你已有的配置", "会话的 <code>subagent/model-selection-policy</code>（你已在 DSH 设置里授权给子代理的路由），拿不到时回退到 <code>llm</code> 适配器目录。本插件没有任何要新填的路由。")}
    ${fact("是模型在挑", "端点只接受 choice / score / noul，所以候选被做成一道 <code>choice</code> 题，选项用短 id（r0…）映射回真实 provider/model；答案畸形就降级为继承，模型无法拼出不存在的路由。")}
    ${fact("继承永远在选项里", "lead 当前路由始终是候选之一（并明确标注），「就用我现在这个」是合法答案，不是被迫换一个。")}
    ${fact("推理强度按能力取", "effort 从目标模型公布的 <code>efforts</code> 里选；它不公布就省略该字段而不是猜——猜错的 id 会让子代理派生直接失败。")}
    ${fact("显式选择优先", "派生调用里直接传的 provider/model，或 <code>set_model</code> 指定的，都高于自动判断。主 agent 可用 <code>list_models</code> / <code>set_model</code> / <code>list_presets</code>；刻意不做 <code>switch_preset</code>（宿主在 turn 开始后会锁住 preset）。")}
  </div>

  <h3>真实环境验证：子代理真的换了模型</h3>
  <p class="sub">这不是设计稿。2026-11-19 用真实决策端点与真实宿主模块跑通全链路：</p>
  ${table(
    ["层次", "结果"],
    [
      ["<code>node --test test/spawn-model.test.js test/spawn-adapter.test.js</code>", "针对性测试 <strong>46/46 通过</strong>；全量 <code>node --test test/</code> <strong>772/772 通过</strong>"],
      ["真实决策端点", "硅基流动 <code>systemone</code> / <code>Kev-4B</code> → <strong>HTTP 200</strong>；对「逐字照抄文本」任务，模型选了非继承的 <code>r1</code>（概率 <code>r1 0.5881</code> vs <code>r0 0.4119</code>，<code>depth.score 0.3651</code>）"],
      ["真实端到端换模型", "该真实回答经真实 <code>spec.parse/decide</code> 与真实 adapter，产出 <code>agent.model.select(&#123; provider: 'qwenwork', model: 'deepseek-flash', reasoningEffort: 'low' &#125;)</code>——子代理<strong>真的从 lead 的 <code>modelscope-token-plan/Qwen/Qwen3.8-Flash-Next</code> 换成了 <code>qwenwork/deepseek-flash</code></strong>，并按模型能力设好了推理强度"],
    ]
  )}
  <div class="note">
    <strong>关于样本。</strong>上面是一次实测：它证明题型被接受、模型真的在候选里选择、选择真的落到了子代理的模型上——
    不是承诺每个任务都换模型。同一模型在要求高的任务上正确地选了「继承」（r0），这正是设计想要的结果。
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="install">
  <h2>安装</h2>
  <p class="sub">从 npm 装（推荐），或本地开发。</p>

  ${codeBlock("dsh plugin add dsh-decision-engine")}
  <p class="sub">或手动装进 profile，再把 <code>"dsh-decision-engine"</code> 加进 <code>package.json</code> → <code>dsh.profile.bundles</code>，重启 DSH：</p>
  ${codeBlock("cd ~/.dsh/profiles/desktop && pnpm add dsh-decision-engine")}

  <div class="facts">
    ${fact("配置不用重填", "启动时把旧目录的配置与遥测自动搬到 <code>~/.dsh/dsh-decision-engine/</code>，只搬一次，不覆盖后来改的值。")}
    ${fact("本地开发", "<code>git clone</code> 后跑 <code>node scripts/migrate-profile.mjs --write</code>（默认只预览，带 <code>--write</code> 才写入并自动备份）。")}
    ${fact("0.5.0 起", "配置文件名从 <code>startlux.yml</code> 改为 <code>config.yml</code>，旧文件自动迁移，升级不用重填 key。")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="config">
  <h2>配置</h2>
  <p class="sub">
    打开 <strong>插件 → 已安装 → dsh-decision-engine</strong>，配置区出现 Decision Engine 卡片。
    改完即保存，没有保存按钮，也不用重启。
  </p>
  <div class="facts">
    ${fact("三态", "<span class='badge gray'>关闭</span> 不发请求；<span class='badge blue'>观察</span> 判断并记录「本该怎样」但不改行为；<span class='badge green'>生效</span> 按判断执行。")}
    ${fact("密钥", "默认写进 <code>~/.dsh/.credentials.yaml</code> 的 <code>refs:</code> 段，插件目录不留明文；也可选 <code>config</code> 自包含。各 provider 键名互不覆盖。")}
    ${fact("优先级", "显式 key &gt; 密钥存储位置里对应的键 &gt; 环境变量。切换 provider 只改一个键，其它 provider 的值原样留着。")}
    ${fact("模型", "下拉来自当前 provider 的 <code>/v1/models</code>，默认「自动」——不发送该字段，服务商换模型名也不会 400。")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="points">
  <h2>九个决策点</h2>
  <p class="sub">全部实装，由你决定让决策模型进入哪些环节。挂载的 hook 只是实现细节。</p>
  ${pointsTable}

  ${figure("/assets/shot-decisions.png", "决策历史标签页", "决策历史：每一次判断、分数与降级都查得到")}

  <div class="note">
    <strong>为什么不把每个 hook 都打开：</strong>一次判断约 1.9k token、p50 约 0.5 秒，
    而 <code>agent/pre-step</code> / <code>agent/request</code> 每步都触发。热路径上的点都带触发闸，不能无条件调用。
  </div>

  <h3>阈值是实测校准的</h3>
  <p class="sub">用真实端点跑过成对样本（「该判 A」vs「该判 B」），分得开才留着。过程中修掉三个问题：</p>
  <div class="facts">
    ${fact("01 · confidence", "三选项平分时天然只有 0.33，所以分派点的门槛取 0.5（显著高于均分），不能设 0.6，否则 <code>advise</code> 永远判不出。")}
    ${fact("02 · 问法", "问「是否已知道」得到 0.30 / 0.12 毫无区分力；改问「recent 里是否逐字覆盖」后变成 0.92 / 0.01。")}
    ${fact("03 · 判据顺序", "轮次延续若先看 <code>closed</code>，「明确未完成」会掉进默认 <code>stop</code>；现在先看 <code>unfinished</code>。")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="providers">
  <h2>Provider：接哪个决策服务</h2>
  <p class="sub">
    请求形状对所有 provider 完全一致，响应只需含 <code>answers</code>。
    provider 只决定三件事：<strong>往哪发、用谁的 key、默认哪个模型</strong>。
  </p>
  ${codeBlock("POST <base>/decisions  或  POST <base>/systemone")}
  ${providersTable}

  <div class="note ok">
    <strong>开箱即用：</strong><code>siliconflow</code> / <code>siliconflow-intl</code>
    只需粘一个 API key——地址、路径（<code>/systemone</code>）、默认模型（<code>Kev-4B</code>）都已预置。两个站点是两套账号，key 不通用。
  </div>

  <h3>端点路径由服务商决定，不由模型决定</h3>
  <p class="sub">实测过（2026-10-25，真实 key 打真实端点）：</p>
  ${table(
    ["服务商", "模型", "<code>/v1/decisions</code>", "<code>/v1/systemone</code>"],
    [
      ["SiliconFlow", "<code>Kev-4B</code>", "<strong>404 Not Found</strong>", '<span class="badge green">200 ✓</span>'],
      ["bamboonode", "<code>startlux-decision-v1.1-27b-autothink</code>", '<span class="badge green">200 ✓</span>', '<span class="badge green">200 ✓</span>'],
    ]
  )}
  <p class="sub">
    所以「端点风格」只是<strong>首选</strong>：先打首选路径，收到 404 自动换另一条再试一次，
    试通的会被记住（按 base URL 区分）。只有 404 会换路径——400 / 401 / 5xx 与路径无关，换路径只是多烧一次请求。
  </p>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="tokens">
  <h2>省 token 的设计</h2>
  <div class="facts">
    ${fact("双层缓存", "<strong>精确层</strong>完整 state + 问题集一致才复用，默认开启；<strong>同类复用层</strong>刻意丢弃参数内容，默认关闭且工具授权永久禁用——安全决策要么绑定完整上下文，要么不缓存。")}
    ${fact("thinkMode", "默认 <code>never</code>，实测主要省延迟（约 1.9s vs 7.2s）。<code>never</code> / <code>auto</code> / <code>always</code> 可切换，非法值归一成 <code>never</code>。")}
    ${fact("触发闸", "<code>read</code> / <code>grep</code> / <code>glob</code> / <code>todo_write</code> 等只读工具直接放行；state 也截断，<code>recent</code> 只带最近 4 条、每条 240 字符。")}
    ${fact("失败冷却", "连续 3 次失败 → 冷却 60s，期内 0ms 放行、不再对着故障端点烧钱。单次硬超时默认 8000ms（实测 p50≈0.7s、冷启动 p95≈6.4s）。")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="failopen">
  <h2>失败降级（fail-open）</h2>
  <p class="sub">
    <strong>任何不确定都退回原生行为</strong>，守卫自身故障绝不卡住工具调用。
    以下情形全部放行，并在 <code>telemetry.jsonl</code> 记一条 <code>action=degraded</code>。
  </p>
  ${degradeTable}
  <div class="note ok">默认 <code>shadow</code> 时，即使判断出 <code>deny</code> 也只记录、不执行。</div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="verify">
  <h2>验证链路</h2>
  <p class="sub">三条自动化验收，全部可重复跑。</p>
  ${codeBlock("pnpm test && pnpm verify:wiring && pnpm verify:endpoint")}
  ${table(
    ["命令", "覆盖"],
    [
      ["<code>pnpm test</code>", "单元测试：纯函数 + 适配器接线 + providers + 配置往返 + 设置界面渲染 + 缓存回归"],
      ["<code>pnpm verify:wiring</code>", "用真实 schemastery 加载插件，确认宿主确实给了这个服务"],
      ["<code>pnpm verify:endpoint</code>", "9 个决策点逐个打真实端点，校验题型与答案形状"],
    ]
  )}
  <div class="note warn">
    <strong><code>verify:endpoint</code> 不能省。</strong>题型写错会在运行时 400 并静默降级，
    光看日志很难发现「这个点其实一直没生效」。
  </div>

  <h3>手工看一条记录</h3>
  <p class="sub">把某个点切到「观察」，触发一次动作，读 <code>~/.dsh/dsh-decision-engine/telemetry.jsonl</code>：</p>
  <div class="facts">
    ${fact("detail", "<code>no-key</code> → key 没读到；<code>http-404</code> / <code>http-400</code> → 地址或模型不对；<code>answer-shape-mismatch</code> → 问题集要复核。")}
    ${fact("point", "<code>point=route, action=switch</code> 表示该点判出「本该下沉到便宜模型」；每条都带 <code>point</code> 与原始 <code>scores</code>。")}
    ${fact("数据目录", "<code>$DSH_HOME/dsh-decision-engine/</code>，<code>~/.dsh</code> 只是未设置时的默认值；空白值按未设置处理，支持波浪号，相对路径规范化为绝对路径。")}
  </div>
</section>
`;

/* ------------------------------------------------------------------ *
 * flatmap 插件页（中文）
 * ------------------------------------------------------------------ */

const flatmapBody = `
<div class="wrap hero">
  <span class="eyebrow"><span class="dot"></span> DeepSeek Harness 插件 · MIT</span>
  <h1>dsh-model-flatmap</h1>
  <p class="lede">
    把输入框里的模型选择器换成<strong>一块平铺面板</strong>：所有模型、推理等级、
    协作开关在同一平面上，一次看完，没有层层弹层。搜索、分组、跟随主题都在这块面板里；
    设置页还能收窄目录、给 Provider 改名、随时切回原生样式，并自带可选的匿名使用统计开关。
  </p>
  <div class="cta-row">
    <a class="btn btn-primary" href="#install">安装</a>
    <a class="btn" href="#what">它是什么</a>
    <a class="btn" href="https://github.com/zuosus/dsh-model-flatmap">GitHub</a>
  </div>
  <div class="toc">
    <a href="#what">它是什么</a>
    <a href="#features">功能</a>
    <a href="#settings">设置页</a>
    <a href="#install">安装</a>
    <a href="#layout">目录结构</a>
    <a href="#dev">开发</a>
  </div>
</div>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="what">
  <h2>它是什么</h2>
  <p class="sub">
    一个<strong>客户端</strong> DSH 插件，在 Web GUI 与桌面端都生效。它替换 composer 里的
    <code>conversation.input.model</code> 控件，渲染成一块可搜索的平铺网格；
    宿主部分很薄，只负责可选的匿名心跳与两个带信任栅栏的辅助路由。
  </p>

  <div class="stats">
    <div class="stat"><span class="n">0</span><span class="l">个二级菜单</span></div>
    <div class="stat"><span class="n">320px</span><span class="l">面板高度上限</span></div>
    <div class="stat"><span class="n">2</span><span class="l">种分组模式</span></div>
    <div class="stat"><span class="n">shadow</span><span class="l">禁用即复原原生</span></div>
  </div>

  ${figure("/assets/shot-flatmap.jpeg", "运行中的平铺模型选择器", "运行中的面板：模型网格、推理等级、协作开关都在同一平面")}

  <div class="facts">
    ${fact("一块平面", "触发器打开高度上限 320px 的面板。头部、推理等级行、协作行固定常驻，只有模型网格滚动——信息一次看完，不用在弹层之间来回钻。")}
    ${fact("公开 API + 薄宿主", "面板只通过公开的 Client API 读写模型目录、协作设置与宿主文案，UI 全在 <code>client.js</code>，用负优先级覆盖原生 <code>ModelSelect</code>；宿主部分不提供服务、工具或事件，只发可选匿名心跳、响应两个辅助路由。")}
    ${fact("禁用即复原", "关闭 bundle 不触碰任何原生控件，<code>ModelSelect</code> 无残留地恢复。纯 ES 模块、零构建。")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="features">
  <h2>功能</h2>
  <p class="sub">没有嵌套菜单，取而代之的是一块可搜索、可分组、跟随主题的平面。</p>
  <div class="facts">
    ${fact("搜索", "跨所有 provider 与 family 过滤，空组丢弃、不留空标题；前缀 &gt; 子串 &gt; 有序字符匹配。空白拆词，每个 token 都要命中；命中某个 provider（id / 目录名 / 分组标签）时保留其整个目录。")}
    ${fact("两种分组 · 模型家族", "「按 provider」与「按 family」分段切换，与搜索彼此独立。内置词典识别 DeepSeek、Claude、Qwen、GPT 等；已注册品牌按 generation 分节（HY3 / HY4 / HY），未覆盖的按 id 推断，无法判断归 Others（永远排最后）。")}
    ${fact("与原生逐行一致的标签", "触发器与「按 provider」下的每一行都渲染原生 picker 的 <code>conversation.input.model.label</code> 槽——促销角标、倍率、负载标记与原生菜单一致；「按 family」行保留更安静的型号尾标，角标崩溃时回退到目录名。")}
    ${fact("推理等级 · 协作开关", "推理等级是互斥、可键盘操作的分组（radio 语义）；与协作开关放得下就共用一行，放不下各占一行。宿主 Team 服务未挂载时协作行仍保留并置灰、给出提示，绝不无声消失。")}
    ${fact("「默认样式」原生模式", "右下角按钮通过<strong>让位</strong>（dispose 自己的注册）交还宿主真正出厂的 <code>ModelSelect</code>，因此永远是当前 DSH 的最新 picker；返回入口是原生菜单底部独立的整宽描边按钮，选择跨重载保留。没有可交出的 picker 时按钮置灰、面板保持。")}
    ${fact("项目链接按钮", "「默认样式」左侧的链接按钮在新标签打开项目 GitHub 页，地址由 checkout 的 <code>git remote -v</code> 推导（非 GitHub 宿主跳过，无 remote 时回退项目主页）；面板打开时预取，点击是同步 <code>window.open</code>，不会被弹窗拦截。")}
    ${fact("额度不足划删除线", "某模型调用因额度/余额不足失败后，该行带 <code>line-through</code>，<strong>全局</strong>作用于所有会话与工作区并持久化到 localStorage；下次成功调用或 24 小时未再尝试即自动消失。429 由正文判定，纯限流不划线。")}
    ${fact("跟随主题 · 零构建", "只用宿主主题令牌着色，浅色/深色都正确；纯 ES 模块，测试直接读 <code>client.js</code> 驱动真实组件，捕获崩溃、缺失区块与错误列数。")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="settings">
  <h2>设置页 · 模型列表</h2>
  <p class="sub">在应用的「设置 → 模型列表」里，可以把目录收敛成只装得下的那些，并给 Provider 起自己好记的名字。</p>
  <div class="facts">
    ${fact("显示 / 隐藏", "每个 Provider 和每个模型各带一个开关；Provider 开关是<strong>批量写</strong>，同时保留单模型例外（关掉整组再打开想要的两三个）。记录只存被隐藏的项，新装的 Provider 默认可见；改动即时重渲已打开的面板。全部隐藏时面板会指回设置页，不会谎称「暂无可用模型」。")}
    ${fact("自定义 Provider 名称", "点 Provider 行的铅笔改别名（Enter 保存 / Esc 取消 / 一键恢复），按稳定 id 记录。别名统一作用于分组标题、家族行主文本、tooltip 与搜索；路由、选择与原生样式仍用目录原名，原名也仍可搜索。")}
    ${fact("与选择器同源的行", "设置页的模型行复用选择器的命名语法：<code>· x0.01</code> 倍率拆成小号粗体，目录 badge 芯片（促销 / 负载 / 费率）跟在名字后；额度不足的模型在名下以文字标注，整组都无额度时 Provider 也标注。")}
    ${fact("席位冲突诊断", "别的插件抢占模型席位时，这里会点名占位者并提供幂等的「强制修复」；「默认样式」置灰时说明是下方 picker 无法承载返回入口；无法就地修复时如实说明。每次打开都强制重读目录，宿主公布 provider / 模型 / 设置 / 凭据变化时也会刷新。")}
    ${fact("匿名使用统计", "宿主每日至多发一次匿名心跳，只含安装 id、版本、平台、架构，<strong>绝不含 prompt / 模型 / 路径</strong>。本页底部有「匿名使用统计」开关（默认开启），拨动后宿主下次发送即生效、无需重启；删除 <code>analytics.json</code> 可换新安装 id。")}
    ${fact("智能体协作默认值", "「启用智能体团队协作」开关控制<strong>新会话</strong>的默认状态（默认关闭），与面板里的本次会话开关彻底分离，互不污染。")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="install">
  <h2>安装</h2>
  <p class="sub">本包是一个 DSH <strong>bundle</strong>。从插件管理器安装，或手动放进 profile 的 bundle 目录。</p>
  ${codeBlock("dsh plugin add dsh-model-flatmap")}
  <p class="sub">或手动放入 profile（路径因安装而异）：</p>
  ${codeBlock('cp -r . "<profile>/bundles/dsh-model-flatmap"')}
  <div class="note ok">
    <strong>禁用即复原。</strong>在插件列表里启用/停用即可；<code>dsh</code> 加载器读取
    <code>cordis.patch.yml</code> 完成挂载，关闭后原生控件无残留恢复。
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="layout">
  <h2>目录结构</h2>
  <p class="sub">插件很轻：UI 全部集中在 <code>client.js</code>；宿主部分只做心跳与两个辅助路由。</p>
  ${table(
    ["路径", "用途"],
    [
      ["<code>index.js</code>", "宿主部分——bundle 入口；可选匿名每日心跳与两个辅助路由。"],
      ["<code>telemetry.js</code>", "心跳本体：日界/判定纯函数，加上可注入依赖的上报器。"],
      ["<code>repo-url.js</code>", "从 checkout 的 git remote 推导项目链接地址。"],
      ["<code>client.js</code>", "浏览器部分——完整的平铺选择器 UI 与「设置 → 模型列表」页。"],
      ["<code>cordis.patch.yml</code>", "由 <code>dsh</code> bundle 加载器应用的 Cordis 补丁。"],
      ["<code>locale/en.json</code> / <code>locale/zh.json</code>", "英文 / 简体中文文案与元数据。"],
      ["<code>docs/DETAIL.md</code>", "详细行为规格。"],
      ["<code>test/</code>", "通过最小化 hook 运行时驱动的渲染路径测试。"],
    ]
  )}
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="dev">
  <h2>开发</h2>
  <p class="sub">纯 ES 模块，无需构建步骤。</p>
  ${codeBlock("node --test test/")}
  <p class="sub">
    完整行为规格见 <a href="https://github.com/zuosus/dsh-model-flatmap/blob/main/docs/DETAIL.md">docs/DETAIL.md</a>，
    设计决策见 <a href="https://github.com/zuosus/dsh-model-flatmap/blob/main/DECISIONS.md">DECISIONS.md</a>。
  </p>
</section>
`;

/* ------------------------------------------------------------------ *
 * pocket-kit 插件页（中文）
 * ------------------------------------------------------------------ */

const pocketkitBody = `;
<div class="wrap hero">
  <span class="eyebrow"><span class="dot"></span> DeepSeek Harness 插件 · MIT</span>
  <h1>dsh-pocket-kit</h1>
  <p class="lede">
    <strong>口袋工具箱</strong>：一组互相独立的小功能，装进同一个插件——每个功能在设置页
    有各自的开关（默认全开），关掉就是原生行为。已实装两件：把「添加工作区」的目录选择
    钉在应用内 browse 面板（换代理、换 SSH 启动方式也不再弹系统文件面板，改动需重启 DSH 生效）；
    把失败轮次吞掉的输入找回来（放回 / 复制 / 忽略）。
  </p>
  <div class="cta-row">
    <a class="btn btn-primary" href="#install">安装</a>
    <a class="btn" href="#what">它是什么</a>
    <a class="btn" href="https://github.com/zuosus/dsh-pocket-kit">GitHub</a>
  </div>
  <div class="toc">
    <a href="#what">它是什么</a>
    <a href="#features">功能</a>
    <a href="#install">安装</a>
    <a href="#layout">目录结构</a>
    <a href="#dev">开发</a>
  </div>
</div>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="what">
  <h2>它是什么</h2>
  <p class="sub">
    不是单功能插件，而是一个<strong>小功能合集</strong>：宿主按 <code>lib/features/</code>
    里的注册表安装启用的功能，客户端提供「口袋工具箱 / Pocket Kit」设置页——注册表里
    一行一个开关，配置是 volatile 的、不写任何配置文件：输入找回拨完立刻生效；目录选择器
    在启动时决定，拨完需重启 DSH 才生效。
  </p>

  <div class="stats">
    <div class="stat"><span class="n">2</span><span class="l">个已实装功能</span></div>
    <div class="stat"><span class="n">1</span><span class="l">个开关 / 功能</span></div>
    <div class="stat"><span class="n">1</span><span class="l">需要重启的开关</span></div>
    <div class="stat"><span class="n">3</span><span class="l">步加一个新功能</span></div>
  </div>

  <div class="facts">
    ${fact("互相独立", "功能之间零依赖：关掉任何一个，其余照常工作；所有开关都关，行为就回到没装这个插件的样子。")}
    ${fact("两块交付", "<code>cordis.patch.yml</code> 负责启动 composition（目录选择器由此钉住）；<code>lib/index.js</code> + <code>lib/client.js</code> 是普通的 Host + Client 插件行，客户端另出设置页与恢复横幅。")}
    ${fact("不写配置文件", "开关是 volatile 的，只记在设置里、不落盘；目录选择器的 Host 后端与 Client 界面成对被选定，只能在启动时装配，改动在下次重启 DSH 生效。")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="features">
  <h2>功能</h2>

  <h3>inputRecovery · 找回被吞掉的输入</h3>
  <p class="sub">
    一条输入进入回合时会被<strong>记录两次</strong>：浏览器发出时插入 Agent inbox，回合开跑前
    被认领。而对话里的气泡来自第三个事件 <code>user/message</code>，AgentLoop 要到回合处理
    开始才记它。回合死得更早时——插件在工具接线抛错、provider 第一步就炸、进程中途退出——
    日志里有认领、有失败，唯独没有那条消息：界面上输入被吞了，其实它在会话日志里完好无损。
  </p>
  <p class="sub">开着这个功能时：</p>
  <div class="facts">
    ${fact("盯事件流", "宿主监听 live 的 <code>session/event</code>，记住 inbox 插入过哪些人类消息、哪条被本回合认领；回合以 <code>error</code> / <code>interrupted</code> / <code>aborted</code> 结束且从未记入认领消息时，存下文本与失败原因。")}
    ${fact("重启不丢", "记录落在 <code>~/.dsh/dsh-pocket-kit/recovered-input.json</code>，宿主重启不会丢掉待找回的一条。")}
    ${fact("三条动作", "输入框上方出现恢复横幅：<strong>放回</strong>经会话自己的输入 actions 还原真实草稿（撤销栈也在）；<strong>复制</strong>走剪贴板兜底；<strong>忽略</strong>清除记录。")}
  </div>
  <p class="sub">页面经两条同源路由取数，栅栏与「在应用内打开」路由同一套（Host/Origin + 登录 cookie）：</p>
  ${codeBlock("GET  /dsh-pocket-kit/recovered-input?session=<id>")}
  ${codeBlock("POST /dsh-pocket-kit/recovered-input/ack   { session, ids }")}

  <h3>pinBrowsePicker · 钉住目录选择器</h3>
  <p class="sub">
    「添加工作区」把流程交给占用 workspace <code>directoryFlow</code> 席位的后端。出厂的
    auto 选择器<strong>每次启动只采样一次</strong>：受信任主机含非回环 authority、绑定地址
    非回环、或在 SSH 里 → 应用内 browse 面板；macOS / Windows、有图形会话的 Linux →
    系统原生面板。采样只发生在启动，所以代理改写 bind/authority、Clash fake-ip、
    换一种 SSH 启动方式，都会让下一次启动忽然弹出访达而不是内置文件管理器。
  </p>
  <div class="facts">
    ${fact("开关开（默认）", "补丁停用 auto 行，直接 compose 内置 browse 后端与它的 client surface：目录选择恒为应用内面板。")}
    ${fact("开关关", "启动时把出厂 auto 选择器原样挂回——与没装本插件时完全一致。<strong>需重启 DSH、不改任何配置文件</strong>；配置是 volatile 的，拨完下次启动生效。")}
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="install">
  <h2>安装</h2>
  <p class="sub">本包是一个 DSH <strong>bundle</strong>，不走 npm 发布（<code>private: true</code>）：把本地 checkout 以 <code>link:</code> 依赖链进 profile，再重启 DSH。</p>
  <div class="facts">
    ${fact("1 · 依赖", "在 <code>~/.dsh/profiles/&lt;profile&gt;/package.json</code> 的 <code>dependencies</code> 加一行 <code>&quot;dsh-pocket-kit&quot;: &quot;link:/path/to/dsh-pocket-kit&quot;</code>。")}
    ${fact("2 · bundles", "把 <code>&quot;dsh-pocket-kit&quot;</code> 加进同一文件的 <code>dsh.profile.bundles</code>。")}
    ${fact("3 · 装 + 重启", "在 profile 目录跑 <code>npm install</code>（或把符号链接直接放进 profile 的 <code>node_modules/</code>），然后重启 DSH。")}
  </div>
  <div class="note ok">
    <strong>装好之后，改输入找回开关不用重启。</strong>随包的 <code>cordis.patch.yml</code>
    在启动时钉住 browse 选择器：目录选择器这个开关在启动时决定，拨动后需重启 DSH 才生效；
    其余功能开关是 volatile，设置页拨动即时生效（Client 侧改动重载页面即生效）。
  </div>
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="layout">
  <h2>目录结构</h2>
  <p class="sub">一个功能一个模块，注册表与配置声明各一处。</p>
  ${table(
    ["路径", "用途"],
    [
      ["<code>lib/index.js</code>", "宿主入口：Config 声明与已启用功能的安装。"],
      ["<code>lib/features/index.js</code>", "<code>FEATURES</code> 注册表（宿主侧）。"],
      ["<code>lib/features/input-recovery.js</code>", "找回被吞输入的本体。"],
      ["<code>lib/features/pin-browse-picker.js</code>", "目录选择器钉住的运行时挂/摘。"],
      ["<code>lib/client.js</code>", "客户端：设置页与恢复横幅。"],
      ["<code>cordis.patch.yml</code>", "启动 composition 补丁：browse 选择器由此钉住。"],
      ["<code>locale/en.json</code> / <code>locale/zh.json</code>", "英文 / 简体中文文案与元数据。"],
      ["<code>test/</code>", "由最小 hook 运行时驱动的测试套件。"],
      ["<code>docs/DETAIL.md</code>", "详细行为规格。"],
    ]
  )}
</section>

<div class="wrap"><hr class="rule"></div>

<section class="wrap" id="dev">
  <h2>开发</h2>
  <p class="sub">纯 ES 模块，无需构建步骤。</p>
  ${codeBlock("npm test")}
  <p class="sub">
    七套测试（host / config / client / render / banner / pin-switch / resolve），
    本地 checkout 实测全绿（2026-11-19）。加一个新功能只要三步：<code>lib/features/&lt;id&gt;.js</code>
    导出 <code>apply(ctx, enabled)</code>、宿主与客户端两张 <code>FEATURES</code> 表各加一行、
    <code>Config</code> 加一个 <code>z.boolean().default(true).volatile()</code>——
    设置页从 Config 声明自动认到新开关，页面代码不用改。
  </p>
  <p class="sub">
    完整行为规格见
    <a href="https://github.com/zuosus/dsh-pocket-kit/blob/main/docs/DETAIL.md">docs/DETAIL.md</a>。
  </p>
</section>
`;

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, "assets"), { recursive: true });
await mkdir(path.join(DIST, "dsh-decision-engine"), { recursive: true });
await mkdir(path.join(DIST, "dsh-model-flatmap"), { recursive: true });
await mkdir(path.join(DIST, "en", "dsh-decision-engine"), { recursive: true });
await mkdir(path.join(DIST, "en", "dsh-model-flatmap"), { recursive: true });
await mkdir(path.join(DIST, "dsh-pocket-kit"), { recursive: true });
await mkdir(path.join(DIST, "en", "dsh-pocket-kit"), { recursive: true });

await copyFile(path.join(HERE, "assets/style.css"), path.join(DIST, "assets/style.css"));
await copyFile(path.join(HERE, "assets/app.js"), path.join(DIST, "assets/app.js"));
await copyFile(path.join(HERE, "assets/theme.js"), path.join(DIST, "assets/theme.js"));
await copyFile(path.join(HERE, "assets/mascot.png"), path.join(DIST, "assets/mascot.png"));
// 站点自包含：把两个插件的宣传图与截图一并拷进 dist/，make-bundle.mjs 会以
// base64 嵌进 Worker（见 BINARY_EXT）。图片源在各自仓库的 docs/assets/ 里，
// 这里只放优化过的副本，不引用 GitHub，避免 CSP 放行外域与外链失效。
for (const img of ["promo.jpeg", "shot-config.png", "shot-decisions.png", "shot-flatmap.jpeg"]) {
  await copyFile(path.join(HERE, "assets", img), path.join(DIST, "assets", img));
}

// 中文（默认）与英文各四页（首页 + 三个插件页）；alt 互相指认，hreflang 与导航语言按钮共用。
const ZH_HOME = { lang: "zh-CN", self: "/", alt: { path: "/en/", label: "English" } };
const ZH_PROJ = {
  lang: "zh-CN",
  self: "/dsh-decision-engine/",
  alt: { path: "/en/dsh-decision-engine/", label: "English" },
};
const ZH_FLATMAP = {
  lang: "zh-CN",
  self: "/dsh-model-flatmap/",
  alt: { path: "/en/dsh-model-flatmap/", label: "English" },
};
const EN_HOME = { lang: "en", self: "/en/", alt: { path: "/", label: "中文" } };
const EN_PROJ = {
  lang: "en",
  self: "/en/dsh-decision-engine/",
  alt: { path: "/dsh-decision-engine/", label: "中文" },
};
const EN_FLATMAP = {
  lang: "en",
  self: "/en/dsh-model-flatmap/",
  alt: { path: "/dsh-model-flatmap/", label: "中文" },
};
const ZH_POCKETKIT = {
  lang: "zh-CN",
  self: "/dsh-pocket-kit/",
  alt: { path: "/en/dsh-pocket-kit/", label: "English" },
};
const EN_POCKETKIT = {
  lang: "en",
  self: "/en/dsh-pocket-kit/",
  alt: { path: "/dsh-pocket-kit/", label: "中文" },
};

await writeFile(
  path.join(DIST, "index.html"),
  page(
    "dsh.zuos.us — DeepSeek Harness 插件索引",
    "dsh.zuos.us 收录的 DeepSeek Harness 插件索引：dsh-decision-engine、dsh-model-flatmap 与 dsh-pocket-kit 的介绍与安装入口。",
    indexBody,
    ZH_HOME
  )
);

await writeFile(
  path.join(DIST, "dsh-decision-engine/index.html"),
  page(
    "dsh-decision-engine — 给 DeepSeek Harness 的决策层",
    "便宜的决策层：在主模型动手前，把当前状态与一组结构化问题发给小的决策模型，用它的概率化答案决定放行、询问、拦截、换模型或跳过。九个决策点全部已实装，派生子代理时还由决策模型自己挑模型。默认 shadow 只记录不打断。",
    pluginBody,
    ZH_PROJ
  )
);

await writeFile(
  path.join(DIST, "en/index.html"),
  page(
    "dsh.zuos.us — DeepSeek Harness plugin index",
    "An index of DeepSeek Harness plugins on dsh.zuos.us: guides and install links for dsh-decision-engine, dsh-model-flatmap and dsh-pocket-kit.",
    indexBodyEn,
    EN_HOME
  )
);

await writeFile(
  path.join(DIST, "en/dsh-decision-engine/index.html"),
  page(
    "dsh-decision-engine — a judgement layer for DeepSeek Harness",
    "A cheap judgement layer for DeepSeek Harness: sends state plus a set of structured questions to a small decision model and uses the probability-bearing answers to allow, ask, block, reroute or skip. All nine decision points implemented; the decision model also picks models for spawned subagents. Shadow mode by default.",
    pluginBodyEn,
    EN_PROJ
  )
);

await writeFile(
  path.join(DIST, "dsh-model-flatmap/index.html"),
  page(
    "dsh-model-flatmap — 平铺的 DSH 模型选择器",
    "一个平铺、无二级菜单的 DSH 模型选择器：把会话输入框的 model 控件换成一个平面面板，所有模型与推理等级都在同一平面上，没有层层弹层。跨 provider 全局搜索、按 provider / 按 family 两分组、额度不足自动划删除线，纯浏览器端、零构建。",
    flatmapBody,
    ZH_FLATMAP
  )
);

await writeFile(
  path.join(DIST, "en/dsh-model-flatmap/index.html"),
  page(
    "dsh-model-flatmap — a flat model picker for DeepSeek Harness",
    "A flat, two-level-free model picker for DeepSeek Harness: replaces the composer model control with one surface where every model and reasoning level is visible at once, no nested popovers. Cross-provider search, by-provider / by-family grouping, strike-through on out-of-balance models. Browser-only, no build step.",
    flatmapBodyEn,
    EN_FLATMAP
  )
);

await writeFile(
  path.join(DIST, "dsh-pocket-kit/index.html"),
  page(
    "dsh-pocket-kit — DSH 口袋工具箱",
    "DSH 口袋工具箱：一组互相独立的小功能装进一个插件，每个功能一个开关、默认开启、关掉即回原生。已实装：目录选择器钉在应用内 browse 面板，失败轮次吞掉的输入可原样找回。",
    pocketkitBody,
    ZH_POCKETKIT
  )
);

await writeFile(
  path.join(DIST, "en/dsh-pocket-kit/index.html"),
  page(
    "dsh-pocket-kit — a pocket toolkit for DeepSeek Harness",
    "A pocket toolkit for DeepSeek Harness: independent small features in one plugin, each with its own switch, on by default. Live today: pin the workspace directory picker to the in-app browse backend, and recover prompts a failed turn swallowed.",
    pocketkitBodyEn,
    EN_POCKETKIT
  )
);

console.log("built ->", DIST);

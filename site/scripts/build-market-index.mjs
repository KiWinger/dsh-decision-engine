/**
 * 生成 DSH「自定义插件索引」format 1 文档：site/dist/dsh-market/index.json。
 *
 * 收录源头是 site/market-plugins.json（本项目推荐的插件清单 + 精确版本 +
 * 真实 npm 发布时间）。「自动收录」= 加插件只改那个 manifest 并跑一次构建，
 * 索引自动带上；不在这里硬编码站点首页列表之外的东西。
 *
 * 验证：优先用官方 @deepseek-ai/dsh-plugin-market-index 的 parseMarketIndex；
 * 没装官方包时用 test/fixtures/market-index-parser.mjs 的最小同规则校验。
 * 一份不合法的索引会让构建失败，而不是发给用户让 DSH 整份拒收。
 *
 * 用法：
 *   node site/scripts/build-market-index.mjs            # 用 manifest 当前数据
 *   node site/scripts/build-market-index.mjs --refresh  # 拉 npm registry 刷新版本后再生成
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..");
const ROOT = join(SITE, "..");
const DEFAULT_MANIFEST = join(SITE, "market-plugins.json");
const OUT = join(SITE, "dist", "dsh-market", "index.json");
export const INDEX_URL = "https://assets.zuos.us/dsh-market/index.json";

const META = {
  "dsh-decision-engine": {
    title: { en: "DSH Decision Engine", zh: "决策引擎" },
    description: {
      en: "A cheap decision model judges every call before the main model acts — allow, escalate, reroute or skip. Nine individually switchable decision points.",
      zh: "主模型动手前，用一个便宜的小模型做判断：放行、询问、换模型或跳过。九个决策点逐个可切换。",
    },
    repository: { url: "https://github.com/zuosus/dsh-decision-engine" },
    keywords: ["decision", "routing", "tokens", "subagent"],
  },
  "dsh-model-flatmap": {
    title: { en: "DSH Model Flatmap", zh: "平铺模型选择器" },
    description: {
      en: "Replaces the model picker with one flat, searchable panel — every model and reasoning level at once, filterable and renamable.",
      zh: "把模型选择器换成平铺面板：所有模型与推理等级一次看完，支持搜索、筛选与改名。",
    },
    repository: { url: "https://github.com/zuosus/dsh-model-flatmap" },
    keywords: ["model-picker", "ui", "provider", "flatmap"],
  },
  "dsh-pocket-kit": {
    title: { en: "DSH Pocket Kit", zh: "口袋工具箱" },
    description: {
      en: "Independent small tools in one plugin, each with its own switch: in-app directory picker, swallowed-prompt recovery banner, and a custom mascot.",
      zh: "一组独立小工具装进同一个插件，逐功能开关：应用内目录选择器、吞输入找回横幅、自定义鲸鱼娘图标。",
    },
    repository: { url: "https://github.com/zuosus/dsh-pocket-kit" },
    keywords: ["tools", "productivity", "ui", "mascot"],
  },
};

async function parseMarketIndexLocal() {
  try {
    return (await import("@deepseek-ai/dsh-plugin-market-index")).parseMarketIndex;
  } catch {
    return (await import(pathToFileURL(join(ROOT, "test", "fixtures", "market-index-parser.mjs")).href)).parseMarketIndex;
  }
}

function semverDesc(a, b) {
  const pa = String(a.version).split(/[.-]/);
  const pb = String(b.version).split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number(pa[i]);
    const y = Number(pb[i]);
    if (!Number.isNaN(x) && !Number.isNaN(y) && x !== y) return y - x;
    if (pa[i] !== pb[i]) return String(pb[i]).localeCompare(String(pa[i]));
  }
  return 0;
}

/** 从 npm registry 刷新每个插件的版本与真实发布时间。 */
async function refreshVersions(manifest) {
  for (const plugin of manifest.plugins) {
    const res = await fetch("https://registry.npmjs.org/" + encodeURIComponent(plugin.name), {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error("npm registry " + res.status + " for " + plugin.name);
    const doc = await res.json();
    const times = doc.time || {};
    plugin.versions = Object.keys(doc.versions || {}).map((version) => ({
      version,
      publishTimestamp: Math.floor(Date.parse(times[version]) / 1000),
    })).filter((v) => Number.isFinite(v.publishTimestamp) && v.publishTimestamp >= 0);
    process.stdout.write("  refreshed " + plugin.name + ": " + plugin.versions.length + " versions\n");
  }
  return manifest;
}

/**
 * 从 manifest 生成 format 1 文档。
 * @param manifestPath 可选；测试用临时 manifest 走失败路径。
 */
export async function buildMarketIndex(manifestPath = DEFAULT_MANIFEST) {
  let manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.format !== 1 || !Array.isArray(manifest.plugins)) {
    throw new Error("manifest 必须是 { format: 1, plugins: [...] }");
  }
  // 收录前置校验：重名直接失败（官方解析器也会整份拒收）。
  const names = new Set();
  for (const p of manifest.plugins) {
    if (names.has(p.name)) throw new Error("duplicate plugin in manifest: " + p.name);
    names.add(p.name);
  }
  if (process.argv.includes("--refresh")) manifest = await refreshVersions(manifest);

  const doc = {
    format: 1,
    title: { en: "dsh.zuos.us recommended plugins", zh: "dsh.zuos.us 推荐插件" },
    description: {
      en: "Plugins recommended by the dsh.zuos.us project — free, open source, pinned to real npm releases.",
      zh: "dsh.zuos.us 项目推荐的 DeepSeek Harness 插件，全部免费开源，版本钉定到真实 npm 发布。",
    },
    plugins: manifest.plugins.map((p) => {
      const meta = META[p.name] || {};
      const versions = (p.versions || []).slice().sort(semverDesc);
      if (versions.length === 0) throw new Error("no versions for " + p.name);
      const seen = new Set();
      for (const v of versions) {
        if (seen.has(v.version)) throw new Error("duplicate version " + p.name + "@" + v.version);
        seen.add(v.version);
        if (!Number.isInteger(v.publishTimestamp) || v.publishTimestamp < 0 || v.publishTimestamp >= 1e11) {
          throw new Error("bad publishTimestamp for " + p.name + "@" + v.version);
        }
      }
      return {
        name: p.name,
        ...(meta.title ? { title: meta.title } : {}),
        ...(meta.description ? { description: meta.description } : {}),
        ...(meta.repository ? { repository: meta.repository } : {}),
        metadata: { keywords: meta.keywords || [] },
        versions: versions.map((v) => ({
          version: v.version,
          publishTimestamp: v.publishTimestamp,
          source: { type: "npm", registry: "https://registry.npmjs.org/" },
        })),
      };
    }),
  };

  // 官方规则自检：失败直接抛，构建中止。
  const validate = await parseMarketIndexLocal();
  validate(doc, INDEX_URL);
  return doc;
}

async function main() {
  const doc = await buildMarketIndex();
  if (process.argv.includes("--refresh")) {
    await writeFile(DEFAULT_MANIFEST, JSON.stringify({
      format: 1,
      plugins: doc.plugins.map((p) => ({
        name: p.name,
        versions: p.versions.map((v) => ({ version: v.version, publishTimestamp: v.publishTimestamp })),
      })),
    }, null, 2) + "\n");
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(doc, null, 2) + "\n");
  console.log("market index: " + OUT + " (" + doc.plugins.length + " plugins)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

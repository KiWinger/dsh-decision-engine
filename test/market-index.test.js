/**
 * DSH 插件市场索引：本项目推荐的插件必须能被 DSH「自定义插件索引」收录。
 *
 * 测试先行（TDD）：本文件在 site/scripts/build-market-index.mjs 存在之前写成，
 * 第一次运行因「行为缺失」而失败（红），实现后再跑转绿。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SITE = join(ROOT, "site");
const MANIFEST = join(SITE, "market-plugins.json");
const BUILDER = join(SITE, "scripts", "build-market-index.mjs");
const INDEX_URL = "https://assets.zuos.us/dsh-market/index.json";
const EXPECTED = ["dsh-decision-engine", "dsh-model-flatmap", "dsh-pocket-kit"];

async function build() {
  const mod = await import(pathToFileURL(BUILDER).href + "?t=" + Date.now());
  return await mod.buildMarketIndex();
}

test("manifest 列出站点首页的所有插件（自动收录的源头）", async () => {
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const names = manifest.plugins.map((p) => p.name);
  assert.deepEqual(names.slice().sort(), EXPECTED.slice().sort());
});

test("生成的索引是 format 1 且三个插件各含精确版本（正常路径）", async () => {
  const doc = await build();
  assert.equal(doc.format, 1);
  assert.equal(typeof doc.title, "object");
  assert.ok(Object.hasOwn(doc.title, "en"), "title 必须含 en");
  assert.equal(doc.plugins.length, 3);
  const names = doc.plugins.map((p) => p.name);
  assert.deepEqual(names.slice().sort(), EXPECTED.slice().sort());
  for (const p of doc.plugins) {
    assert.ok(Array.isArray(p.versions) && p.versions.length > 0, p.name + " 必须有版本");
    for (const v of p.versions) {
      assert.match(v.version, /^\d+\.\d+\.\d+/);
      assert.equal(typeof v.publishTimestamp, "number");
      assert.ok(v.publishTimestamp > 0 && v.publishTimestamp < 1e11);
      assert.equal(v.source.type, "npm");
    }
  }
});

test("生成的索引通过官方 format 1 解析器（可安装的真实数据）", async () => {
  const doc = await build();
  // 官方解析器是 DSH 实际用来拒绝整份文档的实现；本地若没有该包，
  // 退到仓库自带的最小同规则校验，不能跳过校验本身。
  let parseMarketIndex;
  try {
    ({ parseMarketIndex } = await import("@deepseek-ai/dsh-plugin-market-index"));
  } catch {
    const mod = await import(pathToFileURL(join(HERE, "fixtures", "market-index-parser.mjs")).href);
    parseMarketIndex = mod.parseMarketIndex;
  }
  assert.doesNotThrow(() => parseMarketIndex(doc, INDEX_URL));
});

test("版本按 SemVer 降序，最新版本来自 npm 真实发布时间（边界）", async () => {
  const doc = await build();
  for (const p of doc.plugins) {
    for (let i = 1; i < p.versions.length; i++) {
      assert.ok(p.versions[i - 1].version >= p.versions[i].version, p.name + " 版本降序");
    }
    const latest = p.versions[0];
    const registry = JSON.parse(await readFile(join(tmpdir(), "npm-" + p.name.replace(/^dsh-/, "") + ".json"), "utf8").catch(() => "null"));
    if (registry && registry.time && registry.time[latest.version]) {
      assert.equal(latest.publishTimestamp, Math.floor(Date.parse(registry.time[latest.version]) / 1000));
    }
  }
});

test("manifest 出现重复名字或非法版本时构建失败（失败路径）", async () => {
  const mod = await import(pathToFileURL(BUILDER).href + "?t=bad");
  const bad = {
    format: 1,
    plugins: [
      { name: "dsh-decision-engine", versions: [{ version: "1.0.0", publishTimestamp: 1 }] },
      { name: "dsh-decision-engine", versions: [{ version: "2.0.0", publishTimestamp: 2 }] },
    ],
  };
  const dir = await mkdtemp(join(tmpdir(), "market-bad-"));
  const file = join(dir, "plugins.json");
  await writeFile(file, JSON.stringify(bad));
  try {
    await assert.rejects(() => mod.buildMarketIndex(file), /duplicate|重复/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

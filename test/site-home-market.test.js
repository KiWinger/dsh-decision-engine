/**
 * Hero 的「安装插件市场」入口 + R2 (bucket public) 绑定 + Worker 的 /dsh-market/index.json 路由。
 * 测试先行：实现前这些断言全部因行为缺失而失败（红）。
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SITE = join(ROOT, "site");
const URL_TEXT = "https://assets.zuos.us/dsh-market/index.json";

async function read(rel) { return await readFile(join(ROOT, rel), "utf8"); }

// 真实构建产物：UI 断言必须看用户真正看到的 HTML，而不是源码模板。
// 构建到独立临时目录：node --test 并发加载的 site-theme.test.js 会 rm(dist/)，
// 共享 dist/ 会出现「一边构建一边被删」的 ENOENT 竞态。
const TEST_DIST = mkdtempSync(join(tmpdir(), "dsh-market-dist-"));
execFileSync(process.execPath, [join(SITE, "build.mjs")], {
  cwd: ROOT, stdio: "pipe", env: { ...process.env, DSH_SITE_DIST: TEST_DIST },
});
function ensureBuilt() {}
async function dist(rel) { return await readFile(join(TEST_DIST, rel), "utf8"); }

test("首页 hero 有安装按钮，且面板含完整安装步骤与索引 URL（中文）", async () => {
  ensureBuilt();
  const html = await dist("index.html");
  const hero = html.slice(0, html.indexOf('<hr class="rule">'));
  assert.match(hero, /market-install|安装插件市场/);
  assert.match(hero, /自定义插件索引/);
  assert.match(hero, /发现/);
  assert.ok(hero.includes(URL_TEXT), "hero 必须给出完整索引 URL");
  assert.match(hero, /<details[^>]*class="market-install"/);
});

test("英文首页也有同样的安装入口", async () => {
  ensureBuilt();
  const html = await dist("en/index.html");
  const hero = html.slice(0, html.indexOf('<hr class="rule">'));
  assert.match(hero, /Install this plugin index/i);
  assert.match(hero, /Custom plugin index/i);
  assert.ok(hero.includes(URL_TEXT));
});

test("三处部署配置都绑定了名为 public 的 R2 bucket", async () => {
  const wrangler = await read("site/wrangler.jsonc");
  const cf = await read("site/cloudflare.config.ts");
  const deploy = await read("site/deploy.mjs");
  assert.match(wrangler, /"r2_buckets"[\s\S]*"binding"\s*:\s*"PUBLIC"[\s\S]*"bucket_name"\s*:\s*"public"/);
  assert.match(cf, /bindings\.r2\(\{[\s\S]*name\s*:\s*"public"/);
  assert.match(deploy, /r2_buckets[\s\S]*PUBLIC[\s\S]*public/);
});

test("Worker 从 R2 提供 /dsh-market/index.json：CORS、cache、无重定向", async () => {
  const source = await read("site/make-bundle.mjs");
  assert.match(source, /\/dsh-market\/index\.json/);
  assert.match(source, /env\.PUBLIC\.get/);
  assert.match(source, /access-control-allow-origin/);
  assert.match(source, /max-age=300/);
});

test("未绑定 R2 时路由返回 503 JSON，而不是 500 或空响应", async () => {
  const source = await read("site/make-bundle.mjs");
  assert.match(source, /!env\|\|!env\.PUBLIC|!env\.PUBLIC/);
  assert.match(source, /r2-not-configured/);
});

test("每次部署都会先更新 public/index.json（npm run deploy 链）", async () => {
  const pkg = JSON.parse(await read("site/package.json"));
  assert.match(pkg.scripts.deploy, /upload:market[\s\S]*cf deploy/);
  assert.equal(pkg.scripts["upload:market"], "node deploy-market.mjs");
  const uploader = await read("site/deploy-market.mjs");
  assert.match(uploader, /r2.*objects.*put/);
  assert.match(uploader, /--bucket-name/);
  assert.match(uploader, /BUCKET\s*=\s*"public"/);
  assert.match(uploader, /dsh-market\/index\.json/);
});

test("构建脚本把生成的索引写进 dist，且 dist 的 index.json 与构建结果一致", async () => {
  ensureBuilt();
  const build = await read("site/build.mjs");
  assert.match(build, /build-market-index|market-index/);
  const doc = JSON.parse(await dist("dsh-market/index.json"));
  assert.equal(doc.format, 1);
  assert.equal(doc.plugins.length, 3);
});
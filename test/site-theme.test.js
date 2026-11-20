/**
 * 站点主题（DEC-065）：light/dark 完全由浏览器
 * `prefers-color-scheme` 自动驱动——没有手动切换按钮，没有
 * `data-theme` 属性，没有 localStorage，theme.js 整个删除。
 *
 * 为什么测构建产物而不是源文件：行为落在 8 个已渲染页面与拷贝进
 * dist/ 的 CSS/JS 里，只查源码会漏掉「源改了、构建没带上」的漂移
 * （site-worker.test.js 对 bundle 做静态检查，这里对 dist/ 做真构建
 * 检查）。dist/ 是 gitignore 产物，build.mjs 只做本地文件 I/O、无
 * 网络，在测试里跑一次构建是安全的。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, "..", "site");
const DIST = join(SITE, "dist");

const PAGES = [
  "index.html",
  "dsh-decision-engine/index.html",
  "dsh-model-flatmap/index.html",
  "dsh-pocket-kit/index.html",
  "en/index.html",
  "en/dsh-decision-engine/index.html",
  "en/dsh-model-flatmap/index.html",
  "en/dsh-pocket-kit/index.html",
];

// 真实跑一次构建，后面所有断言都对着 dist/ 产物。
execFileSync(process.execPath, [join(SITE, "build.mjs")], { stdio: "pipe" });

const read = (p) => readFile(join(DIST, p), "utf8");

/** 按花括号配对抽出所有 `@media (prefers-color-scheme: dark) { ... }` 块。 */
function extractDarkBlocks(css) {
  const marker = "@media (prefers-color-scheme: dark)";
  const out = [];
  let i = 0;
  for (;;) {
    const at = css.indexOf(marker, i);
    if (at === -1) break;
    const open = css.indexOf("{", at);
    if (open === -1) break;
    let depth = 1;
    let j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
      j++;
    }
    out.push(css.slice(at, j));
    i = j;
  }
  return out;
}

for (const page of PAGES) {
  test(`页面 ${page}：无主题按钮、无 data-theme、不引用 theme.js`, async () => {
    const html = await read(page);
    assert.ok(!html.includes("theme-btn"), "导航不应再有太阳/月亮主题按钮");
    assert.ok(!html.includes("data-theme"), "页面不应依赖 data-theme 属性");
    assert.ok(!html.includes("theme.js"), "不应再引用 theme.js 脚本");
    // 回归：theme-color 的 light/dark 两条 meta 是主题相关里唯一要保留的。
    assert.ok(html.includes('media="(prefers-color-scheme: light)"'), "theme-color light meta 应保留");
    assert.ok(html.includes('media="(prefers-color-scheme: dark)"'), "theme-color dark meta 应保留");
  });
}

test("style.css：深色调色板只挂在 prefers-color-scheme 媒体查询下", async () => {
  const css = await read("assets/style.css");
  assert.ok(!css.includes("data-theme"), "不得再出现任何 [data-theme] 选择器");

  const blocks = extractDarkBlocks(css);
  assert.ok(blocks.length >= 1, "应有 @media (prefers-color-scheme: dark) 块");
  const inside = blocks.join("\n");
  assert.ok(inside.includes("--bg: #0b0e14"), "深色背景 token 应在媒体查询内");
  assert.ok(inside.includes("color-scheme: dark"), "color-scheme: dark 应在媒体查询内");

  // 把媒体查询块整体去掉之后，深色痕迹必须一个不剩——
  // 否则说明某处还在用属性选择器/写死值挂深色。
  let outside = css;
  for (const b of blocks) outside = outside.replace(b, "");
  assert.ok(!outside.includes("#0b0e14"), "深色背景值不得出现在媒体查询之外");
  assert.ok(!outside.includes("color-scheme: dark"), "color-scheme: dark 不得出现在媒体查询之外");
  assert.ok(!outside.includes("#06210f"), "btn-primary 深色字色应随调色板进媒体查询");
});

test("app.js：不再有主题切换逻辑，复制按钮保留", async () => {
  const js = await read("assets/app.js");
  assert.ok(!js.includes("dsh-theme"), "不得再读写 dsh-theme localStorage 键");
  assert.ok(!js.includes("data-theme"), "不得再设置 data-theme 属性");
  assert.ok(!js.includes("theme-btn"), "不得再为主题按钮绑事件");
  assert.ok(js.includes("copy-btn"), "命令块复制按钮逻辑应保留");
});

test("theme.js 已从源与产物中删除", async () => {
  for (const p of [join(SITE, "assets", "theme.js"), join(DIST, "assets", "theme.js")]) {
    await assert.rejects(
      stat(p),
      undefined,
      `${p} 不应再存在`,
    );
  }
});

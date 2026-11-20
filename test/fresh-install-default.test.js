/**
 * 「全新安装默认开免费模型」这个决定的验收（DEC-062）。
 *
 * 需求只有一句：新安装的用户默认打开「使用免费模型」。但「默认开」不能
 * 一刀切——老用户升级后仍保持原来的关，绝不能因为一次升级就悄悄开始向
 * 授权服务端发请求、或把已经在用的本地 key 顶掉。所以这条测试盯三件事：
 *
 *   1. 全新安装（本机无任何历史配置）时，生效默认 serverProvider = true；
 *   2. 本机曾有过配置（config.yml 或任一历史位置的文件）时，默认仍是 false；
 *   3. 两种情况下，用户显式写下的 true/false 都必须压过缺省值——「默认开」
 *      不能变成「强制开」，想关的人永远能关。
 *
 * 做法与 test/server-provider-route.test.js 一致：DSH_HOME 指到临时目录，
 * 最小假 ctx 走真实 apply()，用 GET /status 读生效值。
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { apply } from "../lib/index.js";

/** 造隔离环境，fetch 打到下发端点时回一份最小合法载荷。 */
function setup({ seedFiles = [] } = {}) {
  const home = mkdtempSync(join(tmpdir(), "dsh-fresh-default-"));
  process.env.DSH_HOME = home;
  for (const rel of seedFiles) {
    const path = join(home, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, "enabled: false\n", { encoding: "utf8", mode: 0o600 });
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    async json() {
      return { ok: true, v: 1, baseUrl: "https://api.example.com/v1", model: "Kev-4B", key: "sk-x", ttlSeconds: 600 };
    },
    async text() {
      return "";
    },
  });
  const routes = {};
  const connection = { fetch: { register(entry) { routes[entry.path] = entry; } } };
  const ctx = {
    logger: { info() {}, warn() {}, debug() {} },
    on() {},
    get(name) { return name === "connection" ? connection : undefined; },
    inject(_names, fn) { fn(); },
    plugin() {},
    effect() {},
  };
  apply(ctx, {});
  return {
    async status() {
      const res = await routes["/api/decision-engine/status"].fetch({ method: "GET" });
      return res.json();
    },
    home,
    restore() {
      globalThis.fetch = originalFetch;
      rmSync(home, { recursive: true, force: true });
    },
  };
}

test("全新安装：免费模型默认开，且缺省值不写进 config.yml", async () => {
  const env = setup();
  try {
    const data = await env.status();
    assert.equal(data.serverProvider.enabled, true, "全新安装默认必须开免费模型");
    assert.equal(
      existsSync(join(env.home, "plugins", "dsh-decision-engine", "config.yml")),
      false,
      "默认开只是内存里的缺省值，不应凭空生成 config.yml",
    );
  } finally {
    env.restore();
  }
});

test("已有 config.yml（升级用户）：默认仍是关", async () => {
  const env = setup({ seedFiles: ["dsh-decision-engine/config.yml"] });
  try {
    const data = await env.status();
    assert.equal(data.serverProvider.enabled, false, "已有配置的用户默认必须仍关");
  } finally {
    env.restore();
  }
});

test("旧文件名 startlux.yml 也算已有配置，默认仍关", async () => {
  const env = setup({ seedFiles: ["dsh-decision-engine/startlux.yml"] });
  try {
    const data = await env.status();
    assert.equal(data.serverProvider.enabled, false, "旧文件名存在时不能当成新安装");
  } finally {
    env.restore();
  }
});

test("历史数据目录里的配置也算已有配置，默认仍关", async () => {
  const env = setup({ seedFiles: ["dsh-startlux-decision/startlux.yml"] });
  try {
    const data = await env.status();
    assert.equal(data.serverProvider.enabled, false, "历史目录有配置时不能当成新安装");
  } finally {
    env.restore();
  }
});

test("显式写入的 false 仍能被保存并生效——默认开不等于强制开", async () => {
  // 用户从配置页把开关拨到关，会经 PUT /config 落盘。下一次读取时 config.yml
  // 里有了显式的 false，必须盖过全新安装的缺省 true。这条钉住的是「开关还是
  // 真的开关」，不是把默认开实现成写死的 true。
  const home = mkdtempSync(join(tmpdir(), "dsh-fresh-explicit-"));
  const prev = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => "" });
  try {
    const routes = {};
    const connection = { fetch: { register(entry) { routes[entry.path] = entry; } } };
    const ctx = {
      logger: { info() {}, warn() {}, debug() {} },
      on() {},
      get(name) { return name === "connection" ? connection : undefined; },
      inject(_names, fn) { fn(); },
      plugin() {},
      effect() {},
    };
    apply(ctx, {});
    const put = await routes["/api/decision-engine/config"].fetch({
      method: "PUT",
      async text() { return JSON.stringify({ serverProvider: false }); },
    });
    assert.equal((await put.json()).serverProvider.enabled, false, "显式关掉应立刻生效");
    const res = await routes["/api/decision-engine/status"].fetch({ method: "GET" });
    assert.equal((await res.json()).serverProvider.enabled, false, "重读后仍应是关");
  } finally {
    globalThis.fetch = originalFetch;
    process.env.DSH_HOME = prev ?? "";
    if (prev === undefined) delete process.env.DSH_HOME;
    rmSync(home, { recursive: true, force: true });
  }
});

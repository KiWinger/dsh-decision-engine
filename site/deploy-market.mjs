/**
 * 把构建生成的插件市场索引上传到 R2 bucket public。
 *
 * Workers Builds 的 Deploy command 是 npm run deploy，现在是
 *   npm run upload:market && cf deploy
 * 所以每次 main 上有 plugins / manifest 变化触发部署，public/index.json
 * （实际对象键 dsh-market/index.json）都会先于 Worker 被更新——这就是
 * 「有 plugins 更新就主动更新 public/index.json」。
 *
 * 用 cf CLI 而不是手写 API：Workers Builds 环境里 cf 已登录且知道账号，
 * 不需要在本仓库放任何 token；dry-run 可用 --dry-run 验证。
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, "dist", "dsh-market", "index.json");
const BUCKET = "public";
const KEY = "dsh-market/index.json";

if (!existsSync(FILE)) {
  console.error("缺少 " + FILE + "：先跑 npm run build 生成插件市场索引");
  process.exit(1);
}
const CF = process.platform === "win32" ? "cf.cmd" : "cf";
const args = [
  "r2", "objects", "put", KEY,
  "--bucket-name", BUCKET,
  "--content-type", "application/json",
  "--file", FILE,
];
if (process.argv.includes("--dry-run")) args.push("--dry-run");
try {
  execFileSync(CF, args, { cwd: HERE, stdio: "inherit" });
  console.log("✓ public/" + KEY + " 已更新");
} catch (err) {
  console.error("上传 public/" + KEY + " 失败：" + (err && err.message ? err.message : String(err)));
  process.exit(1);
}

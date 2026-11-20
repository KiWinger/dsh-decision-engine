/**
 * DSH 插件市场索引 format 1 的最小校验器（仅用于测试/offline 自检）。
 * 真正上线前用官方包 @deepseek-ai/dsh-plugin-market-index 的 parseMarketIndex；
 * 这里实现同一套关键规则：format/title、包名、SemVer、时间戳、版本去重与降序、
 * source 类型、本地化文本必须含 en。
 */
import semver from "semver";

const LANG = /^[a-z]{2,8}(?:-[a-z0-9]{1,8})*$/;
const PKG = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;

function fail(path, reason) {
  const err = new Error(path + " " + reason);
  err.path = path;
  throw err;
}
function localized(v, path) {
  if (typeof v === "string") return v.trim() ? v : fail(path, "empty");
  if (!v || typeof v !== "object" || Array.isArray(v)) fail(path, "object");
  for (const [k, val] of Object.entries(v)) {
    if (!LANG.test(k)) fail(path + "." + k, "bad language id");
    if (typeof val !== "string" || !val.trim()) fail(path + "." + k, "empty");
  }
  if (!Object.hasOwn(v, "en")) fail(path, "must contain en");
  return v;
}
export function parseMarketIndex(value, indexUrl) {
  if (!URL.canParse(indexUrl)) fail("$", "bad index url");
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("$", "object");
  if (value.format !== 1) fail("$.format", "must be 1");
  if (!Array.isArray(value.plugins)) fail("$.plugins", "array");
  localized(value.title, "$.title");
  const names = new Set();
  for (const [i, p] of value.plugins.entries()) {
    const at = "$.plugins[" + i + "]";
    if (!p || typeof p !== "object") fail(at, "object");
    if (typeof p.name !== "string" || p.name.length > 214 || !PKG.test(p.name)) fail(at + ".name", "bad npm name");
    if (names.has(p.name)) fail(at + ".name", "duplicate");
    names.add(p.name);
    if (p.title !== undefined) localized(p.title, at + ".title");
    if (p.description !== undefined) localized(p.description, at + ".description");
    if (!Array.isArray(p.versions) || p.versions.length === 0) fail(at + ".versions", "non-empty");
    let prev = null;
    const seen = new Set();
    for (const [j, v] of p.versions.entries()) {
      const vt = at + ".versions[" + j + "]";
      if (!v || typeof v !== "object") fail(vt, "object");
      if (typeof v.version !== "string" || semver.valid(v.version) === null) fail(vt + ".version", "exact SemVer");
      if (seen.has(v.version)) fail(vt + ".version", "duplicate");
      seen.add(v.version);
      if (prev && semver.lt(v.version, prev)) fail(vt + ".version", "must be descending");
      prev = v.version;
      if (!Number.isInteger(v.publishTimestamp) || v.publishTimestamp < 0 || v.publishTimestamp >= 1e11) fail(vt + ".publishTimestamp", "Unix seconds");
      if (!v.source || (v.source.type !== "npm" && v.source.type !== "git")) fail(vt + ".source", "npm or git");
    }
  }
  return value;
}

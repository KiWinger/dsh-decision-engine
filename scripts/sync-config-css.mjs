import { readFileSync, writeFileSync } from "node:fs";

// The host loads client.js directly, without resolving local CSS imports.
// Keep the editable CSS separate; ship its exact text in the existing bundle.
const clientUrl = new URL("../lib/client.js", import.meta.url);
const css = readFileSync(new URL("../lib/client.config.css", import.meta.url), "utf8");
const source = readFileSync(clientUrl, "utf8");
const startToken = "    const CFG_SECTION_CSS = `";
const start = source.indexOf(startToken);
const end = source.indexOf("`;", start + startToken.length);
if (start < 0 || end < 0 || /[`$]/u.test(css)) {
  throw new Error("Cannot safely synchronize configuration CSS");
}
let next = source.slice(0, start + startToken.length) + "\n" + css + source.slice(end);
const controls = readFileSync(new URL("../lib/client.config-controls.js", import.meta.url), "utf8");
const begin = "    // BEGIN CONFIG CONTROLS\n";
const finish = "    // END CONFIG CONTROLS";
const controlStart = next.indexOf(begin);
const controlEnd = next.indexOf(finish, controlStart);
if (controlStart < 0 || controlEnd < 0) throw new Error("Missing configuration control source markers");
next = next.slice(0, controlStart + begin.length) + controls.split("\n").map((line) => line ? `    ${line}` : "").join("\n") + next.slice(controlEnd);
if (process.argv.includes("--check")) {
  if (next !== source) throw new Error("Run node scripts/sync-config-css.mjs before shipping");
} else {
  writeFileSync(clientUrl, next);
}

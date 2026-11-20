// 站点构建期共用的 HTML 片段。纯字符串拼接，无模板引擎。
//
// 图标：插件包里的 icon.svg 是它们自己的资产，站点不改动。
// 站点品牌图标是 assets/mascot.png；三个插件页各用一枚渐变描边的自绘 SVG。

const GRAD = (id) => `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="3" y1="6" x2="33" y2="30">
      <stop offset="0%" stop-color="#3AC251"/>
      <stop offset="52%" stop-color="#2BAE7E"/>
      <stop offset="100%" stop-color="#1481BF"/>
    </linearGradient>`;

// 品牌：站点自有 PNG 资产。
const ICON = `<img class="brand-mascot" src="/assets/mascot.png" alt="" role="img" aria-label="dsh.zuos.us" width="28" height="28">`;

// dsh-decision-engine：一个输入 → 一个判断点 → 三种处置（放行 / 询问 / 拦截）。
const DECISION_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" role="img" aria-label="Decision Engine">
  <defs>${GRAD("de")}</defs>
  <g fill="none" stroke="url(#de)" stroke-width="2.5" stroke-linecap="round">
    <path d="M3 18h7"/>
    <path d="M15 18 23 9.5"/>
    <path d="M15 18h13"/>
    <path d="M15 18 23 26.5"/>
  </g>
  <g fill="url(#de)">
    <circle cx="12.5" cy="18" r="3.4"/>
    <circle cx="25" cy="8" r="2.4"/>
    <circle cx="30" cy="18" r="2.4"/>
    <circle cx="25" cy="28" r="2.4"/>
  </g>
</svg>`;

// dsh-model-flatmap：一块平面上平铺的模型格，没有二级菜单。
const FLATMAP_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" role="img" aria-label="Flat model picker">
  <defs>${GRAD("fm")}</defs>
  <rect x="3.5" y="6.5" width="29" height="23" rx="4.5" fill="none" stroke="url(#fm)" stroke-width="2.2"/>
  <g fill="url(#fm)">
    <rect x="7.5" y="11" width="6.5" height="6" rx="1.6"/>
    <rect x="14.75" y="11" width="6.5" height="6" rx="1.6" opacity=".38"/>
    <rect x="22" y="11" width="6.5" height="6" rx="1.6" opacity=".38"/>
    <rect x="7.5" y="20" width="6.5" height="6" rx="1.6" opacity=".38"/>
    <rect x="14.75" y="20" width="6.5" height="6" rx="1.6"/>
    <rect x="22" y="20" width="6.5" height="6" rx="1.6" opacity=".38"/>
  </g>
</svg>`;

// dsh-pocket-kit：口袋工具箱——两只工具从口袋口探出来，袋身一圈描边。
const POCKETKIT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" role="img" aria-label="Pocket Kit">
  <defs>${GRAD("pk")}</defs>
  <g fill="none" stroke="url(#pk)" stroke-width="2.4" stroke-linecap="round">
    <path d="M12.8 12.4 11.2 7.4"/>
    <path d="M23.4 12.4 24.8 7.6"/>
    <path d="M7 13.5v12a4.5 4.5 0 0 0 4.5 4.5h13A4.5 4.5 0 0 0 29 25.5v-12"/>
    <path d="M4.5 13.5h27"/>
  </g>
  <circle cx="10.7" cy="5.6" r="2.2" fill="url(#pk)"/>
  <rect x="24" y="3" width="3.4" height="4" rx="1.3" fill="url(#pk)"/>
</svg>`;

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function nav({ brand = "dsh.zuos.us", links = [], i18n = null } = {}) {
  const items = links
    .map((l) => `<a class="link${l.opt ? " opt" : ""}" href="${l.href}">${esc(l.label)}</a>`)
    .join("\n        ");
  const lang = i18n
    ? `<a class="link i18n-link" href="${i18n.href}" hreflang="${i18n.hreflang}">${esc(i18n.label)}</a>`
    : "";
  return `<header class="nav">
  <div class="nav-inner">
    <a class="brand" href="/">
      ${ICON}
      <span>${esc(brand)}</span>
    </a>
    <div class="nav-spacer"></div>
        ${items}
        ${lang}
  </div>
</header>`;
}

export function footer() {
  return `<footer>
  <div class="wrap">
    <span>© ${new Date().getFullYear()} zuosus</span>
    <span>MIT License</span>
  </div>
</footer>`;
}

export function codeBlock(cmd) {
  return `<div class="code-block"><pre><code><span class="pfx">$ </span>${esc(cmd)}</code></pre></div>`;
}

export function table(headers, rows) {
  const th = headers.map((h) => `<th>${h}</th>`).join("");
  const tr = rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("\n");
  return `<div class="table-scroll"><table>
<thead><tr>${th}</tr></thead>
<tbody>
${tr}
</tbody>
</table></div>`;
}

/** 站内截图 / 宣传图。图片随站点一起打包，全部走 /assets/ 同源路径。 */
export function figure(src, alt, caption = "") {
  return `<figure class="shot">
  <img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async">
  ${caption ? `<figcaption>${caption}</figcaption>` : ""}
</figure>`;
}

/** 一行「要点」：左侧短标签 + 右侧说明，取代成排的小卡片。 */
export function fact(label, text) {
  return `<div class="fact"><span class="fact-k">${label}</span><span class="fact-v">${text}</span></div>`;
}

export { ICON, DECISION_ICON, FLATMAP_ICON, POCKETKIT_ICON, esc };

// 書き出した文書の基礎の見た目。明暗（`prefers-color-scheme`）・印刷・640px 以下の色と余白を持つ。
// 画面の CSS を集めたものはこの後ろに足されるので、ここは表紙の帯と紙の枠と色のトークンだけを決める。

export const REPORT_EXPORT_STYLE = `
:root {
  color-scheme: light dark;
  --page: #f6f3ef;
  --paper: #fffdfa;
  --ink: #2a2530;
  --ink-soft: color-mix(in srgb, var(--ink) 74%, transparent);
  --ink-quiet: color-mix(in srgb, var(--ink) 56%, transparent);
  --rule: color-mix(in srgb, var(--ink) 14%, transparent);
  --rule-soft: color-mix(in srgb, var(--ink) 8%, transparent);
  --accent: #b8503a;
  --accent-soft: color-mix(in srgb, var(--accent) 10%, transparent);
  --ok: #2f7d4f;
  --ok-soft: color-mix(in srgb, var(--ok) 12%, transparent);
  --code-bg: color-mix(in srgb, var(--ink) 5%, var(--paper));
}
@media (prefers-color-scheme: dark) {
  :root {
    --page: #17151d;
    --paper: #221f2b;
    --ink: #e8e3ea;
    --accent: #f2b0a0;
    --ok: #7fd6a0;
    --code-bg: #1a1822;
  }
}
* { box-sizing: border-box; }
html { background: var(--page); }
body {
  margin: 0;
  color: var(--ink);
  font: 15px/1.75 system-ui, "Hiragino Sans", "Noto Sans JP", sans-serif;
}
main {
  max-width: 760px;
  margin: 40px auto 64px;
  padding: 40px 48px 48px;
  background: var(--paper);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 8px 28px rgb(0 0 0 / 0.06);
}
img { max-width: 100%; height: auto; }
pre { overflow-x: auto; }
.masthead { display: grid; gap: 6px; padding-bottom: 20px; margin-bottom: 24px; border-bottom: 1px solid var(--rule); }
.kicker { display: flex; gap: 10px; align-items: center; font-size: 12px; color: var(--ink-quiet); letter-spacing: 0.04em; }
.kicker .id { font-family: ui-monospace, SFMono-Regular, monospace; color: var(--accent); }
.kicker .outcome { display: inline-flex; gap: 4px; align-items: center; padding: 0 8px; border-radius: 999px; background: var(--ok-soft); color: var(--ok); font-weight: 600; }
.masthead h1 { margin: 0; font-size: 22px; line-height: 1.45; letter-spacing: 0.01em; }
.meta { margin: 0; display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 12.5px; color: var(--ink-quiet); }
.meta div { display: inline; }
.meta dt { display: inline; }
.meta dt::after { content: " "; }
.meta dd { display: inline; margin: 0; color: var(--ink-soft); }
.export-missing-image { color: var(--ink-quiet); font-size: 12.5px; }
@media print {
  html { background: none; }
  main { margin: 0; padding: 0; box-shadow: none; max-width: none; }
  details { border: none; padding: 0; }
  details > summary { display: none; }
  h2 { break-after: avoid; }
  figure, table, pre { break-inside: avoid; }
}
@media (max-width: 640px) {
  main { margin: 0; border-radius: 0; padding: 24px 20px 32px; }}
`

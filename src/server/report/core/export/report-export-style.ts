// 書き出した文書の基礎の見た目。明暗（`prefers-color-scheme`）・印刷・640px 以下の色と余白を持つ。
// 画面の CSS を集めたものはこの後ろに足されるので、ここは表紙の帯と紙の枠と色のトークンだけを決める。

export const REPORT_EXPORT_STYLE = `
:root {
  color-scheme: light dark;
  --ink-soft: color-mix(in srgb, var(--ink) 74%, transparent);
  --ink-quiet: color-mix(in srgb, var(--ink) 56%, transparent);
  --rule: color-mix(in srgb, var(--ink) 14%, transparent);
  --rule-soft: color-mix(in srgb, var(--ink) 8%, transparent);
  --accent-soft: color-mix(in srgb, var(--accent) 10%, transparent);
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

// 明るい環境の色のトークン。画面の CSS を集めたもの（画面はいつも暗い見た目）の後ろに置き、集めた暗い側の値に勝たせる。
// 暗い環境では包みが当たらず、集めた画面の値がそのまま効く。
export const REPORT_EXPORT_LIGHT_TOKENS = `
@media not (prefers-color-scheme: dark) {
  :root {
    --page: #f6f3ef;
    --paper: #fffdfa;
    --ink: #2a2530;
    --accent: #b8503a;
    --ok: #2f7d4f;
    --ground: var(--page);
    --surface: var(--paper);
    --ink-bright: #17131c;
    --ink-soft: color-mix(in srgb, var(--ink) 78%, transparent);
    --ink-quiet: color-mix(in srgb, var(--ink) 66%, transparent);
    --rule: color-mix(in srgb, var(--surface), var(--ink) 20%);
    --rule-control: color-mix(in srgb, var(--surface), var(--ink) 44%);
    --rule-quiet: color-mix(in srgb, var(--surface), var(--ink) 6%);
    --rule-soft: color-mix(in srgb, var(--surface), var(--ink) 10%);
    --surface-accent: color-mix(in srgb, var(--surface), var(--accent) 10%);
    --surface-raised: color-mix(in srgb, var(--ink) 6%, transparent);
    --accent-soft: color-mix(in srgb, var(--accent) 10%, transparent);
    --ok-soft: color-mix(in srgb, var(--ok) 12%, transparent);
    --code-bg: color-mix(in srgb, var(--ink) 5%, var(--paper));
    --state-ok: #2f7d4f;
    --state-warn: #8a5a00;
    --state-ng: #b3261e;
    --state-info: #1f5f9e;
    --state-ask: #6b45b0;
    --state-memo: var(--ink);
    --chart-series-1: #2f6fb8;
    --chart-series-2: #c4552f;
    --chart-series-3: #7a52c4;
    --chart-series-4: #5d7a1c;
    --chart-series-5: #b43f84;
    --chart-series-6: #8f6d12;
    --chart-series-other: #6f6a78;
    --report-code-surface: color-mix(in srgb, var(--ink) 5%, var(--surface));
    --color-text-primary: var(--ink);
    --color-text-secondary: color-mix(in srgb, var(--ink) 78%, transparent);
    --color-border: var(--rule-quiet);
    --color-border-emphasized: var(--rule);
    --color-accent: var(--accent);
    --color-error: var(--state-ng);
    --color-success: var(--state-ok);
    --color-warning: var(--state-warn);
    --color-error-muted: color-mix(in srgb, var(--surface), var(--state-ng) 13%);
    --color-success-muted: color-mix(in srgb, var(--surface), var(--state-ok) 13%);
    --color-text-info: var(--state-info);
    --color-text-success: var(--state-ok);
    --color-text-warning: var(--state-warn);
    --color-text-error: var(--state-ng);
    --color-background-gray: #e2e2e2;
    --color-text-gray: #1b1b1b;
    --focus-outline-color: var(--accent);
    --shadow-ring: 0 0 0 2px var(--accent);
    --shadow-inset-error: inset 0 0 0 0.125rem color-mix(in srgb, var(--state-ng) 30%, transparent);
    --shadow-inset-success: inset 0 0 0 0.125rem color-mix(in srgb, var(--state-ok) 30%, transparent);
    --shadow-inset-warning: inset 0 0 0 0.125rem color-mix(in srgb, var(--state-warn) 30%, transparent);
  }
}
`

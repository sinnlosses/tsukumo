// 版を比べる対を、選ぶ人に見せる形へ組む純粋な関数。
// 選ぶ人にも判定にも版の名前を見せないので、ここが作る HTML と場面には版の名前を入れない（左右と版の対応は呼ぶ側が別のファイルに書く）。

import type { SessionEvent } from "../../src/shared/session/session-event.ts"

type ReportEvent = Extract<SessionEvent, { readonly kind: "report" }>

/** 対の左右。 */
export type PairSide = "left" | "right"

/** HTML に並べる対1つ。画は `shots/<pairId>-left.png`・`-right.png` を指す。 */
export type PairPageEntry = {
  readonly pairId: string
  readonly requestText: string
}

/** 疑似セッションの場面1つ（`readFakeSession` が読む形）。 */
export type PairScene = {
  readonly name: string
  readonly steps: readonly {
    readonly afterMs: number
    readonly event: SessionEvent
  }[]
}

/**
 * 左に置く版が、比べる2版の1本目か2本目か。対の ID の文字コードの和の偶奇で決める。
 * 対ごとに散らすが、打ち直しても同じ並びになる。
 */
export function sideOf(pairId: string): "first" | "second" {
  const sum = [...pairId].reduce((total, character) => total + (character.codePointAt(0) ?? 0), 0)
  return sum % 2 === 0 ? "first" : "second"
}

/** 書き手の `report` を、依頼 → `report` → 結果 → ターンの終わりの4手の場面にする。名前は `<対の ID>-<左右>`。 */
export function pairScene(pairId: string, side: PairSide, reportEvent: ReportEvent): PairScene {
  return {
    name: `${pairId}-${side}`,
    steps: [
      { afterMs: 0, event: { kind: "request", text: `架空の依頼 ${pairId}`, images: [] } },
      { afterMs: 1500, event: reportEvent },
      {
        afterMs: 1550,
        event: {
          kind: "tool-finished",
          toolUseId: reportEvent.toolUseId,
          content: "ok",
          isError: false,
        },
      },
      { afterMs: 2300, event: { kind: "turn-finished", outcome: { kind: "completed" } } },
    ],
  }
}

/** 対ごとに依頼文と左右の画を並べた HTML 1枚。 */
export function pairPage(pairs: readonly PairPageEntry[]): string {
  const sections = pairs.map((pair) => pairSection(pair)).join("\n")
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>レポートの対の見比べ</title>
<style>
:root { --bg: #fafaf7; --fg: #1d1d1b; --muted: #5f5f5a; --line: #d8d8d2; --card: #ffffff; }
@media (prefers-color-scheme: dark) {
  :root { --bg: #161615; --fg: #ecece6; --muted: #a3a39c; --line: #3a3a37; --card: #1f1f1d; }
}
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px 64px; background: var(--bg); color: var(--fg); font: 15px/1.7 system-ui, sans-serif; }
main { max-width: 1840px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 8px; }
.lead { color: var(--muted); margin: 0 0 32px; }
section { border-top: 1px solid var(--line); padding: 24px 0; }
h2 { font-size: 17px; margin: 0 0 8px; font-family: ui-monospace, monospace; }
.request { color: var(--muted); margin: 0 0 16px; white-space: pre-wrap; }
.shots { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
figure { margin: 0; background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 8px; }
figcaption { font-weight: 600; margin-bottom: 8px; }
img { display: block; width: 100%; height: auto; }
@media (max-width: 720px) { .shots { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
<h1>レポートの対の見比べ</h1>
<p class="lead">同じ架空の依頼から書いた2本のレポートを左右に並べています。どちらが速く分かるかで選び、choices.json の対の ID の値を "left" か "right" に書き換えてください（選べなければ "undecided" のまま）。</p>
${sections}
</main>
</body>
</html>
`
}

/** 選択の JSON のひな形。全部の対を `undecided` で持つ。 */
export function choiceTemplate(pairIds: readonly string[]): {
  readonly choices: Readonly<Record<string, "undecided">>
} {
  return { choices: Object.fromEntries(pairIds.map((pairId) => [pairId, "undecided" as const])) }
}

function pairSection(pair: PairPageEntry): string {
  const id = escapeHtml(pair.pairId)
  return `<section id="${id}">
<h2>${id}</h2>
<p class="request">${escapeHtml(pair.requestText)}</p>
<div class="shots">
<figure><figcaption>left</figcaption><img src="shots/${id}-left.png" alt="${id} の左のレポート" loading="lazy"></figure>
<figure><figcaption>right</figcaption><img src="shots/${id}-right.png" alt="${id} の右のレポート" loading="lazy"></figure>
</div>
</section>`
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

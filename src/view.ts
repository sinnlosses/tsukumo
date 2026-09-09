// ビューの識別子と、ブラウザに配る HTML の組み立て。「決める」層。
//
// 純粋関数だけを置き、ネットワーク・ファイル・プロセスには触らない（配るのは src/view-server.ts）。
// 折り返し・全角文字の幅・禁則処理はブラウザに任せる。ここが計算するのは中身だけ。
//
// **メインビュー・キャラビューの中身はまだプレースホルダ**（作業の進行・立ち絵は後続の作業で
// 入る）。サイドバーはこのタスクで中身が決まった（下の `buildSidebarBody`）。

import { type TaskStatusCounts } from "./tasks.ts"

export type ViewName = "main" | "character" | "sidebar"

export const VIEW_NAMES: readonly ViewName[] = ["main", "character", "sidebar"]

export function isViewName(value: string): value is ViewName {
  return VIEW_NAMES.some((name) => name === value)
}

/** ビューのページの URL パス。ここと viewEventPath だけが経路を決める。 */
export function viewPath(view: ViewName): string {
  return `/${view}`
}

/** 更新を押し込む Server-Sent Events の URL パス。 */
export function viewEventPath(view: ViewName): string {
  return `/events/${view}`
}

/**
 * ビューのページ全体を組み立てる。`body` は本文の HTML 断片で、最初の表示に埋め込むと同時に、
 * 以降は Server-Sent Events で届く同じ形の断片で丸ごと差し替えられる
 * （docs/architecture.md「ビューの更新は Server-Sent Events で押す」）。
 */
export function buildViewPage(view: ViewName, body: string): string {
  return page(
    VIEW_TITLE[view],
    `<main id="tsukumo-view">${body}</main>
<script>
  const source = new EventSource(${JSON.stringify(viewEventPath(view))})
  source.addEventListener("update", (event) => {
    document.getElementById("tsukumo-view").innerHTML = event.data
  })
</script>`,
  )
}

/** ビューの一覧ページ。どの URL に何が出るのかを人間が確かめるための入口。 */
export function buildIndexPage(): string {
  const links = VIEW_NAMES.map(
    (view) => `<li><a href="${viewPath(view)}">${escapeHtml(VIEW_TITLE[view])}</a></li>`,
  ).join("\n")

  return page("tsukumo", `<main id="tsukumo-view"><ul>${links}</ul></main>`)
}

/**
 * キャラビューの本文。立ち絵と、発話からのセリフの切り出しは後続の作業で入るため、
 * 今は状態の1行と発話をそのまま出す。
 */
export function buildCharacterBody(status: string, utterance: string | undefined): string {
  const text = utterance ?? PLACEHOLDER_UTTERANCE

  return `<p class="status">${escapeHtml(status)}</p>
<div class="balloon">${escapeHtml(text)}</div>`
}

/** 中身がまだ決まっていないビューの本文。 */
export function buildPlaceholderBody(view: ViewName): string {
  return `<p class="placeholder">${escapeHtml(VIEW_TITLE[view])}（準備中）</p>`
}

/**
 * 1件のサブエージェントについて、サイドバーに出してよい範囲の直近の状況。
 * `description` / `model` は `agent-<id>.meta.json` 由来のラベル（会話内容ではない。
 * ユーザーとの合意事項）。`meta.json` が無い・壊れているサブエージェントでは両方 undefined になり、
 * その場合はツール名だけで表示する。
 */
export type SubagentActivity = {
  readonly description: string | undefined
  readonly model: string | undefined
  /** 直近に使われたツール名。引数・出力は含めない（会話の内容を出さないため）。 */
  readonly latestToolName: string | undefined
}

/** サブエージェントの状況のうち、サイドバーに出す分だけをまとめたもの。 */
export type SubagentsSummary = {
  /** 保留中のサブエージェント件数。件数の権威ある情報源は transcript の `pendingBackgroundAgentCount`
   *  （`src/transcript.ts`）。8行に1回程度しか出ないため、無いときは undefined。 */
  readonly pendingCount: number | undefined
  /** 直近に活動したサブエージェントの状況（1件につき1つ）。「走っているか」の判定はできないため、
   *  ここは活動の有無ではなく**直近の中身**を表す。新しい順。 */
  readonly recentActivity: readonly SubagentActivity[]
}

/** サイドバーの本文を組み立てるために必要な値。取れなかった項目は `undefined` で表す。 */
export type SidebarData = {
  /** 最新の assistant 行の使用トークン数の合計。残量%は含まない（モデルの窓の大きさが
   *  transcript に無いため）。 */
  readonly contextTokens: number | undefined
  readonly subagents: SubagentsSummary
  /** develop/tasks.json の done / todo 件数。ファイルが読めない・壊れているときは undefined。 */
  readonly taskCounts: TaskStatusCounts | undefined
}

/**
 * サイドバーの本文。**「補足情報の置き場」であって単機能パネルではない**ので、独立した3つの
 * 区画（コンテキスト使用量・サブエージェント・タスクの進捗）を並べる
 * （`docs/history/direction.md` 2026-09-09 決定事項。biim システムのサイドバーに倣う）。
 *
 * **会話の内容は出さない。** サブエージェントの直近の活動は、`meta.json` 由来のラベル
 * （`description` / `model`。会話内容ではなくこちら側が付けたタスクラベル）と、直近に使った
 * ツール名までにとどめ、引数や出力は出さない（`docs/coding-standards.md`「会話内容の扱い」）。
 *
 * 3つの区画は互いに独立している。**どれか1つが取れなくても、その区画だけ「不明」を出し、
 * 残りは表示を続ける**（`data` の各フィールドが `undefined` や空配列のときに壊れないこと）。
 */
export function buildSidebarBody(data: SidebarData): string {
  return [
    sidebarSection("コンテキスト使用量", contextUsageBody(data.contextTokens)),
    sidebarSection("サブエージェント", subagentsBody(data.subagents)),
    sidebarSection("タスクの進捗", taskProgressBody(data.taskCounts)),
  ].join("\n")
}

/** 発話などの文字列を HTML に埋め込める形にする。 */
export function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

const PLACEHOLDER_UTTERANCE = "（まだ発話がありません）"

const VIEW_TITLE: Readonly<Record<ViewName, string>> = {
  main: "メインビュー",
  character: "キャラビュー",
  sidebar: "サイドバー",
}

// 3つのビューはそれぞれ別のペインに並ぶので、余白を詰めて縦スクロールだけを許す。
const STYLE = `
  :root { color-scheme: dark; }
  body {
    margin: 0;
    padding: 1rem;
    background: #14161c;
    color: #e6e8ee;
    font-family: system-ui, sans-serif;
    line-height: 1.7;
    overflow-wrap: anywhere;
  }
  .status { margin: 0 0 0.75rem; color: #8f97ab; font-size: 0.85rem; }
  .balloon {
    padding: 0.75rem 1rem;
    border: 1px solid #3a4256;
    border-radius: 0.75rem;
    background: #1c202a;
    white-space: pre-wrap;
  }
  .placeholder { color: #8f97ab; }
  a { color: #8ab4ff; }
  .sidebar-block {
    margin: 0 0 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #3a4256;
    font-size: 0.85rem;
  }
  .sidebar-block:last-child { border-bottom: none; }
  .sidebar-block h2 {
    margin: 0 0 0.4rem;
    font-size: 0.8rem;
    font-weight: 600;
    color: #8f97ab;
  }
  .sidebar-block p { margin: 0.2rem 0; }
  .sidebar-empty { color: #8f97ab; }
  .sidebar-list { margin: 0.2rem 0 0; padding-left: 1.2rem; }
`

function sidebarSection(title: string, body: string): string {
  return `<section class="sidebar-block">
<h2>${escapeHtml(title)}</h2>
${body}
</section>`
}

function contextUsageBody(tokens: number | undefined): string {
  if (tokens === undefined) {
    return `<p class="sidebar-empty">不明</p>`
  }

  return `<p>${escapeHtml(tokens.toLocaleString("ja-JP"))} トークン</p>`
}

function subagentsBody(subagents: SubagentsSummary): string {
  const countLine =
    subagents.pendingCount === undefined
      ? `<p>保留中: 不明</p>`
      : `<p>保留中: ${escapeHtml(String(subagents.pendingCount))}件</p>`

  if (subagents.recentActivity.length === 0) {
    return `${countLine}\n<p class="sidebar-empty">直近の活動なし</p>`
  }

  const items = subagents.recentActivity
    .map((activity) => `<li>${escapeHtml(describeSubagentActivity(activity))}</li>`)
    .join("\n")
  return `${countLine}\n<ul class="sidebar-list">${items}</ul>`
}

/**
 * サブエージェント1件分の表示テキストを組み立てる。`description`（あれば `model` も）と、
 * 直近のツール名を1行にまとめる。`description` が無い（`meta.json` が無い・壊れている）
 * サブエージェントは、従来どおりツール名だけを出す（列から消さない）。
 * どちらも無いときの "(不明)" は、この関数を直接テストするとき用の安全側の既定値。
 */
function describeSubagentActivity(activity: SubagentActivity): string {
  if (activity.description === undefined) {
    return activity.latestToolName ?? "(不明)"
  }

  const modelPart = activity.model === undefined ? "" : ` (${activity.model})`
  const toolPart = activity.latestToolName === undefined ? "" : ` — ${activity.latestToolName}`
  return `${activity.description}${modelPart}${toolPart}`
}

function taskProgressBody(taskCounts: TaskStatusCounts | undefined): string {
  if (taskCounts === undefined) {
    return `<p class="sidebar-empty">不明</p>`
  }

  return `<p>done ${escapeHtml(String(taskCounts.done))} / todo ${escapeHtml(String(taskCounts.todo))}</p>`
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>
`
}

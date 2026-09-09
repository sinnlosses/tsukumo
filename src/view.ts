// ビューの識別子と、ブラウザに配る HTML の組み立て。「決める」層。
//
// 純粋関数だけを置き、ネットワーク・ファイル・プロセスには触らない（配るのは src/view-server.ts）。
// 折り返し・全角文字の幅・禁則処理はブラウザに任せる。ここが計算するのは中身だけ。
//
// **各ビューの中身はまだプレースホルダ**（メインビューの作業の進行、キャラビューの立ち絵、
// サイドバーの情報は後続の作業で入る）。ページの骨組みと更新の受け口だけが確定している。

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
`

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

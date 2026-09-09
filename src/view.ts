// ビューの識別子と、ブラウザに配る HTML の組み立て。「決める」層。
//
// 純粋関数だけを置き、ネットワーク・ファイル・プロセスには触らない（配るのは src/view-server.ts）。
// 折り返し・全角文字の幅・禁則処理はブラウザに任せる。ここが計算するのは中身だけ。
//
// メインビュー・キャラビュー・サイドバーの中身はすべて決まっている（下の `buildMainBody` /
// `buildCharacterBody` / `buildSidebarBody`）。

import { type TaskStatusCounts } from "./tasks.ts"
import { type MainViewEntry } from "./transcript.ts"

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
 * 立ち絵の画像ソース。**SVG はファイルの中身をそのまま埋め込む**（インライン）。
 * `<img>` で読み込むと独立した文書扱いになり、ページ側の CSS 変数 `--outfit-accent` が
 * 届かないため（`characters/README.md` の実測）。それ以外の形式（ラスタ画像）は
 * `<img>` の `src` に data URI を渡す。**どちらの形にするかは src/character.ts が拡張子で
 * 決め、ここでは分岐しない**（利用者が置いた任意のファイルを無検証で流し込まないための仕分け）。
 */
export type CharacterPortraitSource =
  | { readonly kind: "svg"; readonly svgMarkup: string }
  | { readonly kind: "image"; readonly dataUri: string }

/** キャラビューの本文を組み立てるために必要な値。 */
export type CharacterViewData = {
  /**
   * 吹き出しに出すセリフ。規約に従っていない発話（セリフが無い）が来たときに**直前のセリフを
   * 出し続ける**判断は、状態を持つ src/index.ts 側の役目（`docs/requirements.md` 4.2）。
   * ここではもう解決済みの1つの値として受け取り、undefined は「まだ一度もセリフが無い」だけを表す。
   */
  readonly speech: string | undefined
  /** 素材が無い・読めないときは undefined。そのときは吹き出しだけで成立させる。 */
  readonly portrait: CharacterPortraitSource | undefined
  /** 立ち絵の CSS 変数 `--outfit-accent` に渡す差し色。インライン SVG のときだけ見た目に効く。 */
  readonly outfitAccent: string | undefined
  /** 立ち絵の alt / aria-label。 */
  readonly altText: string
}

/**
 * キャラビューの本文。立ち絵と吹き出しを同じ領域に同居させる（`docs/glossary.md`「キャラビュー」）。
 * 表情の切り替えは、差し替えのたびに新しい要素が挿入される性質を利用して、CSS アニメーション
 * （`STYLE` の `portrait-fade-in`）で軽くフェードさせる。JS 側のトランジション制御は要らない。
 */
export function buildCharacterBody(data: CharacterViewData): string {
  const text = data.speech ?? PLACEHOLDER_UTTERANCE
  const portraitHtml =
    data.portrait === undefined
      ? ""
      : portraitMarkup(data.portrait, data.outfitAccent, data.altText)

  return `${portraitHtml}<div class="balloon">${escapeHtml(text)}</div>`
}

/**
 * メインビューの本文。**「作業中」と「完了後」で状態を切り替えず、ツールの実行と発話の詳細を
 * 時系列でそのまま積む**（理由は `src/transcript.ts` の `extractMainViewEntries` を参照。
 * transcript だけからは2つの状態を確実に判定できないため、無理に分けていない）。
 *
 * - **ツールの実行**: `docs/requirements.md` の決定どおり、**引数も結果も出す**（ツール名だけでは
 *   情報として足りず、サイドバーで「Bash ×5」と並んで使い物にならなかった前例があるため）。
 *   結果がまだ届いていないツールは「実行中」と出す
 * - **発話の詳細**: Markdown を `renderMarkdownToHtml` で HTML に整形する。**中身を要約・
 *   再構成しない**（読みづらさの主因は見た目であって内容ではないため。`docs/requirements.md` 2.2）
 *
 * **`thinking` はここに一切現れない。** `extractMainViewEntries` が transcript を読む時点で
 * 除外しているので、この関数の入力に `thinking` の中身が混ざる経路が無い。
 */
export function buildMainBody(entries: readonly MainViewEntry[]): string {
  if (entries.length === 0) {
    return `<p class="placeholder">${escapeHtml(MAIN_VIEW_EMPTY_MESSAGE)}</p>`
  }

  return entries.map((entry) => mainViewEntryHtml(entry)).join("\n")
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

const MAIN_VIEW_EMPTY_MESSAGE = "（まだ作業がありません）"

// ツールの入力・出力は数十KBになることがある（実測: あるツールの --json 出力が170KB）。
// 切り詰めは表示を壊さないためであって秘匿のためではないので、切り詰めた旨だけ添えて残りは捨てる。
const MAX_TOOL_TEXT_LENGTH = 8000

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
  .portrait {
    margin: 0 0 0.75rem;
    text-align: center;
    animation: portrait-fade-in 0.25s ease-out;
  }
  .portrait svg, .portrait-image {
    display: block;
    width: 100%;
    max-width: 11rem;
    height: auto;
    margin: 0 auto;
  }
  @keyframes portrait-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .balloon {
    padding: 0.75rem 1rem;
    border: 1px solid #3a4256;
    border-radius: 0.75rem;
    background: #1c202a;
    white-space: pre-wrap;
  }
  .placeholder { color: #8f97ab; }
  a { color: #8ab4ff; }
  .tool-block {
    margin: 0 0 1rem;
    padding: 0.75rem;
    border: 1px solid #3a4256;
    border-radius: 0.5rem;
    background: #1c202a;
  }
  .tool-block h3 {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    font-family: ui-monospace, SFMono-Regular, monospace;
    color: #8ab4ff;
  }
  .tool-block pre, .detail-block pre {
    margin: 0.4rem 0 0;
    padding: 0.5rem;
    background: #10131a;
    border-radius: 0.4rem;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .tool-result.tool-error { border: 1px solid #d16969; }
  .tool-pending { margin: 0.4rem 0 0; color: #8f97ab; font-style: italic; }
  .detail-block { margin: 0 0 1rem; }
  .detail-block table { border-collapse: collapse; width: 100%; margin: 0.5rem 0; }
  .detail-block th, .detail-block td {
    border: 1px solid #3a4256;
    padding: 0.3rem 0.5rem;
    text-align: left;
  }
  .detail-block :not(pre) > code {
    background: #10131a;
    padding: 0 0.25rem;
    border-radius: 0.25rem;
    font-family: ui-monospace, SFMono-Regular, monospace;
  }
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

/**
 * 立ち絵1件分の HTML。SVG は**エスケープせずファイルの中身をそのまま**差し込む
 * （インライン埋め込みそのものが目的のため）。差し色は `style` 属性の値として埋め込む前提で
 * `escapeHtml` を通す（`"` を含む値で属性が閉じないようにする程度の保護。character.json は
 * 利用者自身が用意するローカルファイルなので、これ以上の検証は行わない）。
 * `aria-label` はラッパー側に付ける（SVG 自身の `aria-label` は素材作成時点の固定値だが、
 * こちらは今の表情を反映した値になる）。
 */
function portraitMarkup(
  portrait: CharacterPortraitSource,
  outfitAccent: string | undefined,
  altText: string,
): string {
  const accentStyle =
    outfitAccent === undefined ? "" : ` style="--outfit-accent: ${escapeHtml(outfitAccent)};"`
  const inner =
    portrait.kind === "svg"
      ? portrait.svgMarkup
      : `<img class="portrait-image" src="${escapeHtml(portrait.dataUri)}" alt="${escapeHtml(altText)}">`

  return `<div class="portrait" role="img" aria-label="${escapeHtml(altText)}"${accentStyle}>${inner}</div>`
}

function mainViewEntryHtml(entry: MainViewEntry): string {
  return entry.kind === "tool" ? toolExecutionHtml(entry) : detailHtml(entry.markdown)
}

function toolExecutionHtml(entry: Extract<MainViewEntry, { readonly kind: "tool" }>): string {
  const inputText = truncateForDisplay(stringifyToolInput(entry.input))
  const resultHtml =
    entry.result === undefined
      ? `<p class="tool-pending">実行中…</p>`
      : `<pre class="tool-result${entry.result.isError ? " tool-error" : ""}"><code>${escapeHtml(
          truncateForDisplay(entry.result.content),
        )}</code></pre>`

  return `<section class="tool-block">
<h3>${escapeHtml(entry.name)}</h3>
<pre class="tool-input"><code>${escapeHtml(inputText)}</code></pre>
${resultHtml}
</section>`
}

function detailHtml(markdown: string): string {
  return `<div class="detail-block">${renderMarkdownToHtml(truncateForDisplay(markdown))}</div>`
}

/** ツールの入力（`unknown`。transcript から来た JSON 値）を、読める形の文字列にする。 */
function stringifyToolInput(input: unknown): string {
  if (input === undefined) {
    return ""
  }

  const json = JSON.stringify(input, null, 2)
  return json ?? String(input)
}

/**
 * 表示を壊さない程度に文字列を切り詰める（`docs/requirements.md`「切り詰めは表示のためであって
 * 秘匿のためではない」）。折りたたんで全部見せる形は採らず、上限を超えた分は捨てて件数だけ添える。
 */
function truncateForDisplay(text: string): string {
  if (text.length <= MAX_TOOL_TEXT_LENGTH) {
    return text
  }

  const omitted = text.length - MAX_TOOL_TEXT_LENGTH
  return `${text.slice(0, MAX_TOOL_TEXT_LENGTH)}\n…（以下 ${String(omitted)} 文字を省略）`
}

/**
 * Markdown を HTML に整形する。**外部の Markdown ライブラリには依存しない**
 * （`docs/architecture.md`「画像処理に外部コマンドを使わない（当面）」と同じ考え方で、
 * 実行時依存を増やさない）。対応する記法は次だけに絞る:
 *
 * - 見出し（`#` 〜 `######`）
 * - フェンス付きコードブロック（```` ``` ````）
 * - 箇条書き（`-` / `*` の番号無しリスト、`1.` の番号付きリスト。ネストは1段に平らにする）
 * - テーブル（GFM 形式。ヘッダ行の次に `---` の区切り行があるものだけをテーブルと認識する）
 * - 段落中のインライン強調（`**太字**`）・インラインコード（`` `code` ``）・リンク
 *   （`[text](url)`）
 *
 * **対応しない記法（引用・ネストしたリスト・画像・水平線など）はブロックとして認識されず、
 * ただの段落テキストとして escapeHtml を通ってそのまま表示される**（構文として壊れず、
 * 崩れた見た目になるだけに留める）。**すべてのテキストは escapeHtml を通してから埋め込む**
 * （コードブロックの中身も含む）ので、Markdown の中に HTML やコードが含まれていてもそのまま
 * 描画されることはない。
 */
function renderMarkdownToHtml(markdown: string): string {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n")
  const blocks: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lineAt(lines, index)

    if (line.trim() === "") {
      index += 1
      continue
    }

    if (isFenceLine(line)) {
      const block = consumeCodeBlock(lines, index)
      blocks.push(block.html)
      index = block.next
      continue
    }

    if (isTableStart(lines, index)) {
      const block = consumeTable(lines, index)
      blocks.push(block.html)
      index = block.next
      continue
    }

    const heading = matchHeading(line)
    if (heading !== undefined) {
      blocks.push(
        `<h${String(heading.level)}>${renderInline(heading.text)}</h${String(heading.level)}>`,
      )
      index += 1
      continue
    }

    if (isUnorderedListLine(line) || isOrderedListLine(line)) {
      const block = consumeList(lines, index, isOrderedListLine(line))
      blocks.push(block.html)
      index = block.next
      continue
    }

    const paragraph = consumeParagraph(lines, index)
    blocks.push(paragraph.html)
    index = paragraph.next
  }

  return blocks.join("\n")
}

function lineAt(lines: readonly string[], index: number): string {
  return lines[index] ?? ""
}

function isFenceLine(line: string): boolean {
  return line.trimStart().startsWith("```")
}

function isUnorderedListLine(line: string): boolean {
  return /^[-*]\s+/.test(line.trim())
}

function isOrderedListLine(line: string): boolean {
  return /^\d+\.\s+/.test(line.trim())
}

function isBlockStartLine(lines: readonly string[], index: number): boolean {
  const line = lineAt(lines, index)
  return (
    isFenceLine(line) ||
    matchHeading(line) !== undefined ||
    isUnorderedListLine(line) ||
    isOrderedListLine(line) ||
    isTableStart(lines, index)
  )
}

function matchHeading(line: string): { readonly level: number; readonly text: string } | undefined {
  const match = /^(#{1,6})\s+(.+)$/.exec(line.trim())
  if (match === null) {
    return undefined
  }

  const marker = match[1] ?? ""
  const text = match[2] ?? ""
  return { level: marker.length, text }
}

type ParsedBlock = { readonly html: string; readonly next: number }

function consumeCodeBlock(lines: readonly string[], start: number): ParsedBlock {
  const fenceLine = lineAt(lines, start).trimStart()
  const language = fenceLine.slice(3).trim()
  const codeLines: string[] = []
  let index = start + 1

  while (index < lines.length && !isFenceLine(lineAt(lines, index))) {
    codeLines.push(lineAt(lines, index))
    index += 1
  }
  // 閉じフェンスが見つからない（発話が途中で切れた等）ときは、残り全部をコードとして扱う。
  const next = index < lines.length ? index + 1 : index

  const languageClass = language === "" ? "" : ` class="language-${escapeHtml(language)}"`
  return {
    html: `<pre><code${languageClass}>${escapeHtml(codeLines.join("\n"))}</code></pre>`,
    next,
  }
}

function isTableStart(lines: readonly string[], index: number): boolean {
  const line = lineAt(lines, index)
  if (line.trim() === "" || !line.includes("|")) {
    return false
  }
  return isTableSeparatorLine(lineAt(lines, index + 1))
}

function isTableSeparatorLine(line: string): boolean {
  const trimmed = line.trim()
  if (trimmed === "" || !trimmed.includes("-")) {
    return false
  }

  const cells = splitTableRow(trimmed)
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell))
}

function splitTableRow(line: string): readonly string[] {
  const withoutOuterPipes = stripOuterPipe(stripOuterPipe(line.trim(), "start"), "end")
  return withoutOuterPipes.split("|").map((cell) => cell.trim())
}

function stripOuterPipe(line: string, side: "start" | "end"): string {
  if (side === "start") {
    return line.startsWith("|") ? line.slice(1) : line
  }
  return line.endsWith("|") ? line.slice(0, -1) : line
}

function consumeTable(lines: readonly string[], start: number): ParsedBlock {
  const header = splitTableRow(lineAt(lines, start))
  const bodyRows: string[][] = []
  let index = start + 2

  while (
    index < lines.length &&
    lineAt(lines, index).trim() !== "" &&
    lineAt(lines, index).includes("|")
  ) {
    bodyRows.push([...splitTableRow(lineAt(lines, index))])
    index += 1
  }

  const headHtml = `<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join("")}</tr></thead>`
  const bodyHtml =
    bodyRows.length === 0
      ? ""
      : `<tbody>${bodyRows
          .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join("")}</tr>`)
          .join("")}</tbody>`

  return { html: `<table>${headHtml}${bodyHtml}</table>`, next: index }
}

function consumeList(lines: readonly string[], start: number, ordered: boolean): ParsedBlock {
  const items: string[] = []
  let index = start

  while (index < lines.length) {
    const line = lineAt(lines, index).trim()
    const matches = ordered ? isOrderedListLine(line) : isUnorderedListLine(line)
    if (!matches) {
      break
    }

    const text = line.replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, "")
    items.push(`<li>${renderInline(text)}</li>`)
    index += 1
  }

  const tag = ordered ? "ol" : "ul"
  return { html: `<${tag}>${items.join("")}</${tag}>`, next: index }
}

function consumeParagraph(lines: readonly string[], start: number): ParsedBlock {
  const paragraphLines: string[] = []
  let index = start

  while (
    index < lines.length &&
    lineAt(lines, index).trim() !== "" &&
    !isBlockStartLine(lines, index)
  ) {
    paragraphLines.push(lineAt(lines, index))
    index += 1
  }

  return {
    html: `<p>${paragraphLines.map((line) => renderInline(line)).join("<br>\n")}</p>`,
    next: index,
  }
}

/**
 * 段落・見出し・リスト・テーブルのセルに使う、簡易インライン記法の変換。
 *
 * **リンクだけは特別扱いする。** URL のスキーム判定は**エスケープ前の生の URL**に対して行う
 * 必要があるため（エスケープ後の文字列で判定すると、記号の実体参照化で判定が狂いうる）、
 * 先にリンク記法だけをテキストから切り出し（`splitOnLinks`）、リンク以外の部分にだけ
 * `escapeHtml` を通してから `**太字**` / `` `コード` `` を当てる。
 */
function renderInline(rawText: string): string {
  return splitOnLinks(rawText)
    .map((part) => (part.kind === "link" ? linkPartHtml(part) : renderPlainInline(part.text)))
    .join("")
}

type InlinePart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly url: string }

const LINK_PATTERN = /\[([^\]]+)\]\(([^)\s]+)\)/g

/** `[text](url)` を実際のリンク記法として切り出し、それ以外の地の文と分ける。 */
function splitOnLinks(rawText: string): readonly InlinePart[] {
  const parts: InlinePart[] = []
  let lastIndex = 0

  LINK_PATTERN.lastIndex = 0
  let match = LINK_PATTERN.exec(rawText)
  while (match !== null) {
    const whole = match[0]
    const text = match[1]
    const url = match[2]

    if (text !== undefined && url !== undefined) {
      if (match.index > lastIndex) {
        parts.push({ kind: "text", text: rawText.slice(lastIndex, match.index) })
      }
      parts.push({ kind: "link", text, url })
      lastIndex = match.index + whole.length
    }

    match = LINK_PATTERN.exec(rawText)
  }

  if (lastIndex < rawText.length) {
    parts.push({ kind: "text", text: rawText.slice(lastIndex) })
  }

  return parts
}

/**
 * `href` に入れてよいスキームの allowlist。**それ以外（`javascript:` / `data:` / 不明なスキーム）は
 * リンクにせず、`[text](url)` の見た目のまま平文として出す**（`docs/coding-standards.md`
 * 「会話内容の扱い」と同じ思想: このビューは localhost とはいえ会話の内容を持っているので、
 * クリックで JavaScript が実行される経路を作らない）。`/` や `#` で始まる相対リンクは許可する。
 * 判定は前後の空白を落とし、大文字小文字を無視して行う（`JavaScript:` のような表記も弾く）。
 */
const ALLOWED_LINK_SCHEMES: readonly string[] = ["http:", "https:", "mailto:"]

function linkPartHtml(part: { readonly text: string; readonly url: string }): string {
  const trimmedUrl = part.url.trim()
  if (!isAllowedLinkUrl(trimmedUrl)) {
    return renderPlainInline(`[${part.text}](${part.url})`)
  }

  return `<a href="${escapeHtml(trimmedUrl)}" rel="noopener noreferrer">${renderPlainInline(part.text)}</a>`
}

function isAllowedLinkUrl(url: string): boolean {
  if (url.startsWith("/") || url.startsWith("#")) {
    return true
  }

  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url)
  if (schemeMatch === null) {
    return false
  }

  const scheme = `${(schemeMatch[1] ?? "").toLowerCase()}:`
  return ALLOWED_LINK_SCHEMES.includes(scheme)
}

/** リンク以外の地の文に使う、`escapeHtml` 済みの上での `**太字**` / `` `コード` `` の変換。 */
function renderPlainInline(rawText: string): string {
  const escaped = escapeHtml(rawText)
  const withCode = escaped.replace(/`([^`]+)`/g, (_match, code: string) => `<code>${code}</code>`)
  return withCode.replace(/\*\*([^*]+)\*\*/g, (_match, text: string) => `<strong>${text}</strong>`)
}

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

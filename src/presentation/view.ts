// ビューの識別子と、ブラウザに配る HTML の組み立て。「決める」層。
//
// 純粋関数だけを置き、ネットワーク・ファイル・プロセスには触らない
// （配るのは src/infrastructure/view-server.ts）。
// 折り返し・全角文字の幅・禁則処理はブラウザに任せる。ここが計算するのは中身だけ。
//
// メインビュー・キャラビューの中身はすべて決まっている（下の `buildMainBody` /
// `buildCharacterBody`）。**サイドバーは段3で `src/ui/sidebar/` へ移った**（docs/design.md 12章）。

import { type MainViewEntry } from "../protocol/session-state.ts"
import { escapeHtml, isAllowedLinkUrl, sanitizeReportHtml } from "./report-html.ts"

/**
 * 旧の SSE 経路が残る2領域。**サイドバー・入力欄は段3/段4で `src/ui/` へ移り、旧の SSE 経路と
 * HTML の組み立て関数は消えた**（docs/design.md 12章）ので、ここにはもう含めない。
 */
export type ViewName = "main" | "character"

export const VIEW_NAMES: readonly ViewName[] = ["main", "character"]

export function isViewName(value: string): value is ViewName {
  return VIEW_NAMES.some((name) => name === value)
}

/** 更新を押し込む Server-Sent Events の URL パス。 */
export function viewEventPath(view: ViewName): string {
  return `/events/${view}`
}

/**
 * 同梱した外部ライブラリを配る経路（`vendor/README.md`）。**名前は allowlist にした固定の
 * 対応表**で、リクエストのパスからファイル名を組み立てない（`..` で外へ出る経路を作らない）。
 */
export const VENDOR_PATH_PREFIX = "/vendor/"

export const VENDOR_ASSET_CONTENT_TYPES: Readonly<Record<string, string>> = {
  "highlight.min.js": "text/javascript; charset=utf-8",
  "highlight-theme.min.css": "text/css; charset=utf-8",
  "chart.umd.min.js": "text/javascript; charset=utf-8",
  "mermaid.min.js": "text/javascript; charset=utf-8",
  "idiomorph.min.js": "text/javascript; charset=utf-8",
}

function vendorPath(name: string): string {
  return `${VENDOR_PATH_PREFIX}${name}`
}

/**
 * **自前のブラウザ側スクリプト**を配る経路。`vendor/`（外から持ってきたもの）と分けてあるのは、
 * 中身の出どころが違うため（こちらは `src/presentation/browser/` を `bun build` でまとめたもので、
 * ディスクには置かず起動時にメモリへ持つ。`src/infrastructure/browser-bundle.ts` の `buildBrowserScript`）。
 */
export const ASSET_PATH_PREFIX = "/assets/"

/** 配るブラウザ側スクリプトの名前。**ここに無い名前は配らない**（vendor と同じ許可リスト方式）。 */
export const BROWSER_SCRIPT_NAME = "browser.js"

export function browserScriptPath(): string {
  return `${ASSET_PATH_PREFIX}${BROWSER_SCRIPT_NAME}`
}

/**
 * 新しいブラウザ側スクリプト（`src/ui/main.tsx` を `bun build` でまとめたもの）の名前。
 * **段2 の時点では何も描かない**（React の入口を束ねて配る経路を通しただけ。段3 から領域ごとに
 * ここへ移る。docs/design.md 12章）。旧の `browser.js` と同じページに両方読む期間がある。
 */
export const UI_SCRIPT_NAME = "ui.js"

export function uiScriptPath(): string {
  return `${ASSET_PATH_PREFIX}${UI_SCRIPT_NAME}`
}

/**
 * 配る CSS の名前。`src/presentation/style/main.css` を `bun build` でまとめたもので、
 * ブラウザ側スクリプトと同じくディスクには置かず起動時にメモリへ持つ
 * （`src/infrastructure/browser-bundle.ts` の `buildStyleSheet`）。
 */
export const STYLE_SHEET_NAME = "style.css"

export function styleSheetPath(): string {
  return `${ASSET_PATH_PREFIX}${STYLE_SHEET_NAME}`
}

/**
 * まとめたレイアウトページの URL パス。**個別ビューのページ（`/main` `/character`
 * `/sidebar`）は 2026-09-12 に消した。** 当初案（3つを別々のタブで開いて `orca terminal split`
 * でペインに並べる）の名残で「デバッグしやすさのため残す」としていたが、実際の目視確認は
 * 合成データで `buildLayoutPage` を呼んで静的 HTML を書き出す方法で行っており、個別ページの経路は
 * 使われていなかった（`docs/architecture.md`「ビューは1枚のページにまとめる」）。利用者が
 * 開くのはこの1本だけでよい。
 */
export const LAYOUT_PATH = "/"

/** {@link buildLayoutPage} に渡す、3領域それぞれの最新の本文。 */
export type LayoutBodies = Readonly<Record<ViewName, string>>

/**
 * メインビュー・キャラビュー・サイドバーを1枚の HTML にまとめ、CSS の grid で領域を分けたページ
 * （`docs/requirements.md` 4.7）。**メインビュー・キャラビューは既存の `/events/<view>` を
 * 個別に購読する**（2本の SSE。押す側の `src/infrastructure/view-server.ts` は経路ごとの
 * `publish` をそのまま使う）。**サイドバーは React の root**（`.layout-sidebar` に
 * `src/ui/main.tsx` が mount する。段3。docs/design.md 12章）で、初期の本文は持たない。
 * ページを丸ごと再読み込みしない理由は `docs/architecture.md`
 * 「ビューの更新は Server-Sent Events で押す」を参照。
 *
 * **ブラウザ側の配線（購読・タブ制御・レポートの描画・仕切り）は `/assets/browser.js`
 * （`src/presentation/browser/`）にある。** 入力欄（送信・中断・`/` 補完・答え待ちの箱）は
 * **段4 で React の root（`.layout-dispatch` に mount する `src/ui/dispatch/`）へ移った**
 * （docs/design.md 12章）ので、ここは他の領域（サイドバー）と同じく空の `<section>` を
 * 出すだけになる。
 */
export function buildLayoutPage(bodies: LayoutBodies): string {
  const topRow = `<div class="layout-row layout-row-top" id="${LAYOUT_ROW_TOP_ID}">
<section class="layout-region layout-main" id="${layoutRegionId("main")}" data-event-path="${viewEventPath("main")}" data-mermaid-src="${vendorPath("mermaid.min.js")}" data-chart-src="${vendorPath("chart.umd.min.js")}">${bodies.main}</section>
<div class="layout-resizer layout-resizer-vertical" id="${LAYOUT_RESIZER_TOP_ID}" role="separator" aria-orientation="vertical" aria-label="メインビューとサイドバーの境界"></div>
<section class="layout-region layout-sidebar" id="${layoutRegionId("sidebar")}"></section>
</div>`

  const bottomRow = `<div class="layout-row layout-row-bottom" id="${LAYOUT_ROW_BOTTOM_ID}">
<section class="layout-region layout-character" id="${layoutRegionId("character")}" data-event-path="${viewEventPath("character")}">${bodies.character}</section>
<div class="layout-resizer layout-resizer-vertical" id="${LAYOUT_RESIZER_BOTTOM_ID}" role="separator" aria-orientation="vertical" aria-label="キャラビューと入力欄の境界"></div>
<section class="layout-region layout-dispatch" id="${layoutRegionId("dispatch")}"></section>
</div>`

  return page(
    "tsukumo",
    `<div class="layout-grid" id="${LAYOUT_GRID_ID}">
${topRow}
<div class="layout-resizer layout-resizer-horizontal" id="${LAYOUT_RESIZER_ROW_ID}" role="separator" aria-orientation="horizontal" aria-label="上段と下段の境界"></div>
${bottomRow}
</div>
<button type="button" id="${LAYOUT_RESET_ID}" class="layout-reset">既定の比率に戻す</button>
<script src="${browserScriptPath()}"></script>
<script type="module" src="${uiScriptPath()}"></script>`,
  )
}

/**
 * レイアウトページの領域の id。サイドバー・入力欄は {@link ViewName} に無い（SSE の領域では
 * ないため。段4で入力欄も React の root になったので、サイドバーと同じ扱いになった）。
 */
type LayoutRegionName = ViewName | "sidebar" | "dispatch"

function layoutRegionId(region: LayoutRegionName): string {
  return `tsukumo-view-${region}`
}

const LAYOUT_GRID_ID = "tsukumo-layout-grid"
const LAYOUT_ROW_TOP_ID = "tsukumo-layout-row-top"
const LAYOUT_ROW_BOTTOM_ID = "tsukumo-layout-row-bottom"
const LAYOUT_RESIZER_ROW_ID = "tsukumo-layout-resizer-row"
const LAYOUT_RESIZER_TOP_ID = "tsukumo-layout-resizer-top"
const LAYOUT_RESIZER_BOTTOM_ID = "tsukumo-layout-resizer-bottom"
const LAYOUT_RESET_ID = "tsukumo-layout-reset"

/**
 * 立ち絵の画像ソース。**SVG はファイルの中身をそのまま埋め込む**（インライン）。
 * `<img>` で読み込むと独立した文書扱いになり、ページ側の CSS 変数 `--outfit-accent` が
 * 届かないため（`characters/README.md` の実測）。それ以外の形式（ラスタ画像）は
 * `<img>` の `src` に data URI を渡す。**どちらの形にするかは src/protocol/character.ts が拡張子で
 * 決め、ここでは分岐しない**（利用者が置いた任意のファイルを無検証で流し込まないための仕分け）。
 */
export type CharacterPortraitSource =
  | { readonly kind: "svg"; readonly svgMarkup: string }
  | { readonly kind: "image"; readonly dataUri: string }

/** キャラビューの本文を組み立てるために必要な値。 */
export type CharacterViewData = {
  /**
   * 吹き出しに並べて出す、今のターンのセリフ（古い→新しいの順）。規約に従っていない発話
   * （セリフが無い）が来たときに**直前のセリフを出し続ける**判断は、状態を持つ src/index.ts
   * 側の役目（`docs/requirements.md` 4.2）。ここではもう解決済みの並びとして受け取り、
   * 空配列は「まだ一度もセリフが無い」だけを表す。
   */
  readonly speeches: readonly string[]
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
 * （`src/presentation/style/character.css` の `portrait-fade-in`）で軽くフェードさせる。JS 側のトランジション制御は要らない。
 *
 * **吹き出しはセリフ1件につき1つ。** 今のターンの分を `.balloon-track` に縦へ積み、最新が
 * 一番下・過去のセリフほど上へ押し上がって見える（`src/presentation/style/character.css` の `.balloon-track` の
 * `column-reverse`）。並びは自前でスクロールする。**立ち絵も吹き出しの並びも下端で揃え**、
 * 最新の吹き出しの左辺から立ち絵へ向けて尻尾を出す（2026-09-12 ユーザーの指示。尻尾の向きは
 * 2026-09-13 に左下から真横へ変更）。**最新の吹き出しの下端の位置は固定の余白
 * （`--balloon-bottom-gap`）で保つ**（2026-09-13 決定。詳細は
 * `src/presentation/style/character.css` の `.balloon-track` のコメント）。**主役は
 * 立ち絵で、読ませたいのは最新のセリフ1件**なので、最新の吹き出しだけを濃く大きく（過去は
 * 小さく薄く）する（詳細は `src/presentation/style/character.css` のコメント）。
 *
 * **キャラは立ち絵と吹き出しだけ。** 答え待ちの箱（`src/ui/dispatch/pending-answer.tsx`）は
 * 入力欄の上に出すことにした（2026-09-11 決定。「左下でキャラの下に出すのは気づかない、
 * 入力欄と離れている」という理由で使いづらかった）。
 * キャラは吹き出しで「これいい？」と言うだけで、ボタンの中身はここには無い。**許可モードの
 * `<select>` はサイドバーのセッション情報（`src/ui/sidebar/session-info.tsx`）へ移した**
 * （2026-09-11 決定。サイドバーの区画ができたため）。
 */
export function buildCharacterBody(data: CharacterViewData): string {
  const portraitHtml =
    data.portrait === undefined
      ? ""
      : portraitMarkup(data.portrait, data.outfitAccent, data.altText)

  // セリフ1件につき吹き出し1つ。**DOM は新しい順**に並べる（`.balloon-track` は
  // `column-reverse` なので先頭＝最新が視覚上いちばん下に来て、`scrollTop = 0`（既定の位置）が
  // そのまま最新を指す。
  // こうしておくと SSE で並びが丸ごと差し替わっても、購読スクリプト側に手を入れずに最新が見える。
  const balloonsHtml =
    data.speeches.length === 0
      ? `<div class="balloon">${escapeHtml(PLACEHOLDER_UTTERANCE)}</div>`
      : [...data.speeches]
          .reverse()
          .map((speech) => `<div class="balloon">${escapeHtml(speech)}</div>`)
          .join("")

  // 立ち絵と吹き出しの並びを横並びにする（`.character-layout`。まとめたレイアウト
  // （`buildLayoutPage`）ではキャラビューは下段の半分幅になり、横長・浅めの領域になるため、
  // 縦積みのままだと窮屈になる）。幅が足りない環境では `flex-wrap: wrap` で自然に縦積みへ戻る
  // （`docs/requirements.md` 4.7「画面レイアウト」）。
  //
  // 立ち絵も吹き出しの並びも下端に寄せる（`src/presentation/style/character.css` の
  // `.character-layout` の `align-items` と `.balloon-track` の `align-self`）。最新の吹き出しの
  // 下端は `.balloon-track` の `margin-bottom`（`--balloon-bottom-gap`）で固定の位置に保つ。
  return `<div class="character-region">
<div class="character-layout">${portraitHtml}<div class="balloon-track">${balloonsHtml}</div></div>
</div>`
}

/**
 * メインビューの本文。**利用者の依頼を境目にして「やり取り」ごとに区切り、今回のやり取りを
 * 上から読める形で出す**（ユーザーの決定 2026-09-10）。過去のやり取りはタブで選んで遡る。
 * 1やり取りの中は**レポート1件と、それに続くツールの実行**を1ステップとしてまとめる。
 *
 * **「作業中」と「完了後」で状態は切り替えない**（理由は `src/transcript.ts` の
 * `extractMainViewEntries` を参照。transcript だけからは2つの状態を確実に判定できない）。
 *
 * - **ツールの実行**: `docs/requirements.md` 4.2 の決定どおり、**利用者が見るべきものだけに
 *   絞る**（`toolVisibility`）。出すのはファイルを変えた操作（ツール名とパス）・
 *   サブエージェントの起動（タスク名）・失敗したツール（エラーの内容）の3種類だけで、
 *   コマンドとその出力・読み取りや検索・未知のツール名は出さない。**絞るのはこの「決める」層の
 *   責務**（`extractMainViewEntries` は読む層なので、絞らずすべての `tool_use` を返す）
 * - **発話の詳細**: Markdown を `renderMarkdownToHtml` で HTML に整形する。**中身を要約・
 *   再構成しない**（読みづらさの主因は見た目であって内容ではないため。`docs/requirements.md` 2.2）
 *
 * **`thinking` はここに一切現れない。** `extractMainViewEntries` が transcript を読む時点で
 * 除外しているので、この関数の入力に `thinking` の中身が混ざる経路が無い。
 */
export function buildMainBody(entries: readonly MainViewEntry[]): string {
  const turns = groupIntoTurns(entries)
    .slice(-MAX_MAIN_VIEW_TURNS)
    .map((turn) => limitTurnEntries(turn))
  const panels = turns.map((turn) => turnPanel(turn))

  if (panels.every((panel) => panel.isEmpty)) {
    return `<p class="placeholder">${escapeHtml(MAIN_VIEW_EMPTY_MESSAGE)}</p>`
  }

  // タブは新しいものが左（[今回][1つ前]…）。パネルは既定で今回だけを見せ、残りは hidden に
  // しておく（スクリプトが動かない環境でも今回のやり取りが読める）。
  const ordered = [...panels].reverse()
  const tabs =
    ordered.length < 2
      ? ""
      : `<div class="turn-tabs" role="tablist">${ordered
          .map((panel, index) => turnTabHtml(panel.id, index, index === 0))
          .join("")}</div>`
  const sections = ordered
    .map(
      (panel, index) =>
        `<section class="turn-panel" data-turn-id="${String(panel.id)}"${index === 0 ? "" : " hidden"}>${panel.html}</section>`,
    )
    .join("\n")

  return `<div class="main-turns">
${tabs}
${sections}
</div>`
}

// 出すやり取りの数（今回・1つ前・2つ前）。**「今回」を読めることが目的**なので、過去は
// タブで遡れる範囲だけを持たせる（本文はまるごと push されるので、数を持ちすぎると転送量が増える）。
// 5から3へ減らしたのはユーザーの指定（2026-09-10「2つ前までで良さそう」）。
const MAX_MAIN_VIEW_TURNS = 3

// 1つのやり取りの中で出す記録の上限。超えた分は**古いほうから**落とし、件数だけを残す
// （やり取りの境界を優先する。ユーザーの決定 2026-09-10）。
const MAX_MAIN_VIEW_ENTRIES = 40

type MainViewToolRun = Extract<MainViewEntry, { readonly kind: "tool" }>
type MainViewQuestion = Extract<MainViewEntry, { readonly kind: "question" }>

/** ステップの中で起きたこと。ツールの実行か、キャラクターからの質問。 */
type MainViewAction = MainViewToolRun | MainViewQuestion

/** 1ステップ＝レポート1件と、それに続く出来事（ユーザーの決定 2026-09-10）。 */
type MainViewStep = {
  readonly report: string | undefined
  readonly actions: readonly MainViewAction[]
}

/**
 * 利用者の依頼1件と、それ以降のステップ。`request` が undefined なのは、最初の依頼より前の記録
 * （セッションの途中から追い始めたときに起こる）。`id` は**追加されても番号がずれない**ように
 * 先頭から数えた通し番号で、ブラウザ側がタブの選択を保つのに使う。
 */
type MainViewTurn = {
  readonly id: number
  readonly request: string | undefined
  readonly steps: readonly MainViewStep[]
  /** 上限を超えて落とした記録の件数。0 のときは何も落としていない。 */
  readonly droppedCount: number
}

/** 時系列に積まれた記録を、利用者の依頼を境目にしてやり取りごとへまとめる。 */
function groupIntoTurns(entries: readonly MainViewEntry[]): readonly MainViewTurn[] {
  const turns: MainViewTurn[] = []
  let current: { id: number; request: string | undefined; steps: MainViewStep[] } | undefined =
    undefined

  const flush = () => {
    if (current !== undefined) {
      turns.push({ ...current, droppedCount: 0 })
    }
  }

  for (const entry of entries) {
    if (entry.kind === "request") {
      flush()
      current = { id: turns.length, request: entry.text, steps: [] }
      continue
    }

    current ??= { id: 0, request: undefined, steps: [] }
    if (entry.kind === "detail") {
      current.steps.push({ report: entry.markdown, actions: [] })
      continue
    }

    const step = current.steps.at(-1)
    // レポートより前に起きたことは、レポートを持たないステップにまとめる。
    current.steps =
      step === undefined
        ? [{ report: undefined, actions: [entry] }]
        : [...current.steps.slice(0, -1), { ...step, actions: [...step.actions, entry] }]
  }
  flush()

  return turns
}

/** 1つのやり取りが持つ記録を上限まで切り詰める。落とすのは**古いほう**（今回の続きを残す）。 */
function limitTurnEntries(turn: MainViewTurn): MainViewTurn {
  const counts = turn.steps.map((step) => (step.report === undefined ? 0 : 1) + step.actions.length)
  const total = counts.reduce((sum, count) => sum + count, 0)
  if (total <= MAX_MAIN_VIEW_ENTRIES) {
    return turn
  }

  const kept: MainViewStep[] = []
  let remaining = MAX_MAIN_VIEW_ENTRIES
  for (const [index, step] of [...turn.steps].reverse().entries()) {
    const count = counts[counts.length - 1 - index] ?? 0
    if (count > remaining) {
      break
    }
    kept.unshift(step)
    remaining -= count
  }

  return { ...turn, steps: kept, droppedCount: total - (MAX_MAIN_VIEW_ENTRIES - remaining) }
}

type TurnPanel = {
  readonly id: number
  readonly html: string
  readonly isEmpty: boolean
}

function turnPanel(turn: MainViewTurn): TurnPanel {
  const steps = turn.steps.flatMap((step) => stepHtml(step))
  const droppedHtml =
    turn.droppedCount === 0
      ? ""
      : `<p class="turn-dropped">これ以前の ${String(turn.droppedCount)} 件は省略した</p>`
  const requestHtml = turn.request === undefined ? "" : requestHeadingHtml(turn.request)

  const stepsHtml = steps.length === 0 ? "" : `<div class="main-steps">${steps.join("\n")}</div>`

  return {
    id: turn.id,
    html: [requestHtml, droppedHtml, stepsHtml].filter((part) => part !== "").join("\n"),
    isEmpty: requestHtml === "" && steps.length === 0,
  }
}

/**
 * 1ステップ分の HTML。レポートもツールも出すものが無いステップは、何も返さない。
 *
 * **ステップは「ひとかたまり」を示すだけで、番号は振らない**（ユーザーの指摘 2026-09-10。
 * 「ステップ1」のような通し番号は読む助けにならない）。**縦に1本で並べる**ので、
 * 段組みはステップの中（レポート本文と、そこで動かしたツールの並べ方）で作る。
 */
function stepHtml(step: MainViewStep): readonly string[] {
  const tools = step.actions.flatMap((action) => actionHtml(action))
  const report = step.report === undefined ? "" : detailHtml(step.report)
  if (report === "" && tools.length === 0) {
    return []
  }

  const toolsHtml = tools.length === 0 ? "" : `<div class="step-tools">${tools.join("")}</div>`

  return [
    `<section class="main-step">
${[report, toolsHtml].filter((part) => part !== "").join("\n")}
</section>`,
  ]
}

const TURN_TAB_LABEL_CURRENT = "今回"

function turnTabHtml(id: number, index: number, isActive: boolean): string {
  const label = index === 0 ? TURN_TAB_LABEL_CURRENT : `${String(index)}つ前`

  return `<button type="button" class="turn-tab${isActive ? " is-active" : ""}" data-turn-id="${String(id)}">${escapeHtml(label)}</button>`
}

// 見出しに出す依頼の全文の長さの上限。タブの上限（MAX_REQUEST_HEADING_LENGTH）とは別物で、
// 複数行ぶんを保つ分だけ長めに取ってある。無いと際限なく長い依頼で DOM が育ち続ける。
const MAX_REQUEST_HEADING_TEXT_LENGTH = 2000

function truncateRequestText(request: string): string {
  return request.length <= MAX_REQUEST_HEADING_TEXT_LENGTH
    ? request
    : `${request.slice(0, MAX_REQUEST_HEADING_TEXT_LENGTH)}…`
}

/**
 * 依頼の見出し。**全行を既定で見せる**（ユーザーの指摘 2026-09-12「複数行の依頼が1行しか
 * 出ない」。**畳んだ状態を既定にすると、クリックが1手増えるだけでこの指摘が残る**）。
 *
 * - **1行の依頼は `<h2>` のまま。** 畳む先が無いのに開閉の三角を出さない
 * - **複数行の依頼は `<details open>`。** 既定で開いているので全行が読め、読み終わったら
 *   閉じて1行目だけにできる。**`<summary>` に1行目、中の `<div>` には2行目以降**を入れて
 *   1行目が二重に出ないようにする。開閉はブラウザ標準なのでスクリプトが要らない
 *
 * どちらの形でも高さは `max-height` で頭打ちにしてあり（`src/presentation/style/main-turns.css` の `.turn-request` と
 * `.turn-request-full`）、長い依頼が画面をその1件で埋めない。
 *
 * **タブのラベルは依頼の文面を使わない**（`turnTabHtml` が出すのは「今回」「1つ前」）ので、
 * 1行目だけを切り出す処理はここには要らない。
 */
function requestHeadingHtml(request: string): string {
  const text = truncateRequestText(request)
  const lineBreak = text.indexOf("\n")
  if (lineBreak === -1) {
    return `<h2 class="turn-request">${escapeHtml(text)}</h2>`
  }

  const firstLine = escapeHtml(text.slice(0, lineBreak))
  const rest = escapeHtml(text.slice(lineBreak + 1)).replaceAll("\n", "<br>")
  return `<details class="turn-request" open><summary>${firstLine}</summary><div class="turn-request-full">${rest}</div></details>`
}

const PLACEHOLDER_UTTERANCE = "（まだ発話がありません）"

const MAIN_VIEW_EMPTY_MESSAGE = "（まだ作業がありません）"

// ツールの入力・出力は数十KBになることがある（実測: あるツールの --json 出力が170KB）。
// 切り詰めは表示を壊さないためであって秘匿のためではないので、切り詰めた旨だけ添えて残りは捨てる。
const MAX_TOOL_TEXT_LENGTH = 8000

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

/**
 * 1件の記録から、メインビューに出す HTML を0個か1個返す（`flatMap` で積むための形）。
 * `detail` は常に出す。`tool` は {@link toolVisibility} が「見せない」と決めたら空配列を返し、
 * 呼び出し側（`buildMainBody`）でそのまま消える。
 */
function actionHtml(action: MainViewAction): readonly string[] {
  return action.kind === "question" ? [questionRecordHtml(action)] : toolRunHtml(action)
}

/**
 * メインビューに残す**質問の記録**。「何を聞いて、どう答えたか」を1つの塊で出す
 * （ユーザーの決定 2026-09-10）。選ばれた答えには印を付ける。**答えが分からないとき**
 * （利用者が質問を差し戻したときなど）は、印を付けずに選択肢だけを出す。
 */
function questionRecordHtml(entry: MainViewQuestion): string {
  const blocks = entry.questions.map((question) => {
    const options = question.options
      .map((option) => {
        const chosen = entry.answers.includes(option.label)
        return `<li class="question-option${chosen ? " is-chosen" : ""}">${
          chosen ? "●" : "○"
        } ${escapeHtml(option.label)}</li>`
      })
      .join("")

    return `<div class="question-record">
<h4>${escapeHtml(question.header)}: ${escapeHtml(question.text)}</h4>
<ul class="question-options">${options}</ul>
</div>`
  })

  return `<section class="tool-block tool-block-question">${blocks.join("\n")}</section>`
}

function toolRunHtml(entry: MainViewToolRun): readonly string[] {
  const visibility = toolVisibility(entry)
  if (visibility.kind === "hidden") {
    return []
  }
  if (visibility.kind === "failed") {
    return [failedToolHtml(entry)]
  }
  if (visibility.kind === "file-change") {
    return [labeledToolHtml(entry, visibility.path ?? FILE_PATH_UNKNOWN_LABEL)]
  }
  return [labeledToolHtml(entry, visibility.description ?? AGENT_DESCRIPTION_UNKNOWN_LABEL)]
}

/**
 * ツール名ごとに `input` の中のファイルパスが入るフィールド名。ここに載っている名前だけを
 * 「ファイルを変えた操作」として扱う（`docs/requirements.md` 4.2）。**未知のツール名はここに
 * 無いので、`toolVisibility` で自動的に「見せない」側に倒れる**（安全側のデフォルト）。
 */
const FILE_PATH_FIELD_BY_TOOL: Readonly<Record<string, string>> = {
  Write: "file_path",
  Edit: "file_path",
  NotebookEdit: "notebook_path",
}

/** サブエージェントを起動するツールの名前。`input.description` がタスク名（会話内容ではない）。 */
const SUBAGENT_LAUNCH_TOOL_NAME = "Agent"

const FILE_PATH_UNKNOWN_LABEL = "(パス不明)"
const AGENT_DESCRIPTION_UNKNOWN_LABEL = "(タスク名不明)"

type ToolVisibility =
  | { readonly kind: "hidden" }
  | { readonly kind: "failed" }
  | { readonly kind: "file-change"; readonly path: string | undefined }
  | { readonly kind: "agent-launch"; readonly description: string | undefined }

/**
 * 1件のツール実行を、メインビューに出してよい範囲で分類する（`docs/requirements.md` 4.2 の
 * 決定を実装したもの）。**判定の優先順位は「失敗 → ファイルを変えた操作 → サブエージェントの
 * 起動 → それ以外は見せない」**。失敗を最優先にするのは、決定表の「失敗したツール」の行が
 * ツールの種類を問わず「出す」としているため（コマンドの出力を隠す方針より優先する）。
 *
 * **未知のツール名（`FILE_PATH_FIELD_BY_TOOL` にも `SUBAGENT_LAUNCH_TOOL_NAME` にも無い名前）は
 * `hidden` に落ちる。** 新しいツールが増えても、ここに追記するまでは安全側（見せない）に倒れる。
 */
function toolVisibility(entry: MainViewToolRun): ToolVisibility {
  if (entry.result !== undefined && entry.result.isError) {
    return { kind: "failed" }
  }

  const filePathField = FILE_PATH_FIELD_BY_TOOL[entry.name]
  if (filePathField !== undefined) {
    return { kind: "file-change", path: stringField(entry.input, filePathField) }
  }

  if (entry.name === SUBAGENT_LAUNCH_TOOL_NAME) {
    return { kind: "agent-launch", description: stringField(entry.input, "description") }
  }

  return { kind: "hidden" }
}

/** `input`（`unknown`。transcript から来た JSON 値）から、指定したフィールドの文字列値を取り出す。 */
function stringField(input: unknown, field: string): string | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const value = input[field]
  return typeof value === "string" ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** 失敗したツールの表示。**ツールの種類によらず、引数と結果（エラーの内容）をそのまま出す。** */
function failedToolHtml(entry: MainViewToolRun): string {
  const inputText = truncateForDisplay(stringifyToolInput(entry.input))
  const resultHtml =
    entry.result === undefined
      ? `<p class="tool-pending">実行中…</p>`
      : `<pre class="tool-result${entry.result.isError ? " tool-error" : ""}"><code>${escapeHtml(
          truncateForDisplay(entry.result.content),
        )}</code></pre>`

  return `<section class="tool-block tool-block-failed">
<h3>${escapeHtml(entry.name)}</h3>
<pre class="tool-input"><code>${escapeHtml(inputText)}</code></pre>
${resultHtml}
</section>`
}

/**
 * ファイルを変えた操作／サブエージェントの起動の表示。**引数や出力は出さず、
 * ツール名とラベル（パス、またはタスク名）だけを見出しに出す。**
 */
function labeledToolHtml(entry: MainViewToolRun, label: string): string {
  const statusHtml = entry.result === undefined ? `<p class="tool-pending">実行中…</p>` : ""

  return `<section class="tool-block">
<h3>${escapeHtml(entry.name)}: ${escapeHtml(label)}</h3>
${statusHtml}
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
 *   （`[text](url)`）・**インライン HTML**（`<span class="badge">` のように段落・表のセル・
 *   箇条書きの項目の途中に書いたもの。2026-09-12 決定。{@link renderPlainInline} 参照）
 * - **HTML のブロック**（行頭がタグに見える行から空行まで）。段組み・カード・SVG の図を
 *   レポート側から組めるようにするため（2026-09-10 決定）
 *
 * どちらの HTML 経路も {@link sanitizeReportHtml} の同じ許可リストを通り、`script` などは
 * 中身ごと落ちる（サニタイズは2箇所に書き分けない）。
 *
 * **対応しない Markdown 記法（引用・ネストしたリスト・画像・水平線など）はブロックとして
 * 認識されず、ただの段落テキストとして表示される**（構文として壊れず、崩れた見た目になるだけに
 * 留める。これらを使いたいときは HTML で書く）。**フェンス付きコードブロックの中身は常に
 * escapeHtml を通してから埋め込む**ので、Markdown の中のコードがそのまま描画されることはない。
 * インラインのコードスパン（`` `code` ``）も同様に文字のまま出す（{@link splitOnCodeSpans}）。
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

    if (isHtmlBlockStart(line)) {
      const block = consumeHtmlBlock(lines, index)
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
    isHtmlBlockStart(line) ||
    isTableStart(lines, index)
  )
}

/**
 * その行から HTML のブロックが始まるか。**行頭（インデントを除く）がタグに見えるときだけ**
 * ブロックとして扱う（`< 3` のような不等号は段落のまま）。閉じタグから始まる形は、
 * ブロックの途中で改行しただけの可能性があるので始まりとは見ない。
 */
function isHtmlBlockStart(line: string): boolean {
  return /^<[a-zA-Z][a-zA-Z0-9-]*[\s/>]/.test(line.trimStart())
}

/**
 * HTML のブロックを空行まで読み、{@link sanitizeReportHtml} に通す。**空行が区切り**なのは
 * Markdown のブロック分けと同じ扱いにするため（HTML の入れ子を数える実装にしない）。
 */
function consumeHtmlBlock(lines: readonly string[], start: number): ParsedBlock {
  const htmlLines: string[] = []
  let index = start

  while (index < lines.length && lineAt(lines, index).trim() !== "") {
    htmlLines.push(lineAt(lines, index))
    index += 1
  }

  return { html: sanitizeReportHtml(htmlLines.join("\n")), next: index }
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

  const code = codeLines.join("\n")

  // ```mermaid / ```chart は「コード」ではなく図・グラフの入れ物にする。中身はどちらも
  // escapeHtml を通してから埋め込み、描画は同梱ライブラリがブラウザ側で行う（reportRenderersScript）。
  if (language === "mermaid") {
    return { html: `<pre class="mermaid">${escapeHtml(code)}</pre>`, next }
  }
  if (language === "chart") {
    return {
      html: `<div class="chart-block"><canvas data-chart="${escapeHtml(code)}"></canvas></div>`,
      next,
    }
  }

  const languageClass = language === "" ? "" : ` class="language-${escapeHtml(language)}"`
  return {
    html: `<pre><code${languageClass}>${escapeHtml(code)}</code></pre>`,
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
 * {@link renderPlainInline} で HTML・`**太字**` / `` `コード` `` を当てる。
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
 * リンクにできない URL（`javascript:` / `data:` / 不明なスキーム）は、`[text](url)` の見た目の
 * まま平文として出す。判定の正典は `src/presentation/report-html.ts` の {@link isAllowedLinkUrl}。
 */
function linkPartHtml(part: { readonly text: string; readonly url: string }): string {
  const trimmedUrl = part.url.trim()
  if (!isAllowedLinkUrl(trimmedUrl)) {
    return renderPlainInline(`[${part.text}](${part.url})`)
  }

  return `<a href="${escapeHtml(trimmedUrl)}" rel="noopener noreferrer">${renderPlainInline(part.text)}</a>`
}

/**
 * リンク以外の地の文に使う変換。段落の途中・表のセル・箇条書きの項目でも、行頭からの
 * HTML ブロック（{@link consumeHtmlBlock}）と同じ**許可リストを通す**ことで、
 * `<span class="badge badge-ok">` のようなインライン HTML をタグとして描く
 * （2026-09-12 決定。以前は `escapeHtml` だけを通していたので、この経路の HTML はタグの
 * 文字列のまま出ていた）。
 *
 * **コードスパンが最優先。** `` `<span>` `` のように書いたものは、中身が HTML に見えても
 * タグとして解釈せず文字のまま出す必要があるため、`` `code` `` をまず切り出し
 * （{@link splitOnCodeSpans}）、コード以外の部分にだけ {@link sanitizeReportHtml} を通す。
 * サニタイズは `src/presentation/report-html.ts` の {@link sanitizeReportHtml} 1箇所に集約し、
 * ここでは呼ぶだけにする。`**太字**` は、サニタイズ済みの文字列（`&` 等は実体参照化済みだが
 * `*` はそのまま残る）に対して最後に当てる。
 */
function renderPlainInline(rawText: string): string {
  const withCode = splitOnCodeSpans(rawText)
    .map((part) =>
      part.kind === "code"
        ? `<code>${escapeHtml(part.text)}</code>`
        : sanitizeReportHtml(part.text),
    )
    .join("")
  return withCode.replace(/\*\*([^*]+)\*\*/g, (_match, text: string) => `<strong>${text}</strong>`)
}

type CodeSpanPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }

const CODE_SPAN_PATTERN = /`([^`]+)`/g

/** `` `code` `` を実際のコードスパンとして切り出し、それ以外の地の文と分ける。 */
function splitOnCodeSpans(rawText: string): readonly CodeSpanPart[] {
  const parts: CodeSpanPart[] = []
  let lastIndex = 0

  CODE_SPAN_PATTERN.lastIndex = 0
  let match = CODE_SPAN_PATTERN.exec(rawText)
  while (match !== null) {
    const whole = match[0]
    const code = match[1]

    if (code !== undefined) {
      if (match.index > lastIndex) {
        parts.push({ kind: "text", text: rawText.slice(lastIndex, match.index) })
      }
      parts.push({ kind: "code", text: code })
      lastIndex = match.index + whole.length
    }

    match = CODE_SPAN_PATTERN.exec(rawText)
  }

  if (lastIndex < rawText.length) {
    parts.push({ kind: "text", text: rawText.slice(lastIndex) })
  }

  return parts
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${vendorPath("highlight-theme.min.css")}">
<link rel="stylesheet" href="${styleSheetPath()}">
<script src="${vendorPath("highlight.min.js")}"></script>
<script src="${vendorPath("idiomorph.min.js")}"></script>
</head>
<body>
${body}
</body>
</html>
`
}

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

/** 送信先として選べるターミナルの一覧を返す経路（GET）。 */
export const TERMINALS_PATH = "/api/terminals"

/** 依頼をターミナルへ送る経路（POST）。 */
export const DISPATCH_PATH = "/api/dispatch"

/** 単体ビューのページで、本文を差し替える要素の id。 */
const STANDALONE_VIEW_ELEMENT_ID = "tsukumo-view"

/**
 * ビューのページ全体を組み立てる。`body` は本文の HTML 断片で、最初の表示に埋め込むと同時に、
 * 以降は Server-Sent Events で届く同じ形の断片で差し替えられる
 * （docs/architecture.md「ビューの更新は Server-Sent Events で押す」）。差し替えの中身は
 * {@link subscriptionScript} を参照。
 */
export function buildViewPage(view: ViewName, body: string): string {
  return page(
    VIEW_TITLE[view],
    `<main id="${STANDALONE_VIEW_ELEMENT_ID}">${body}</main>
<script>
${subscriptionScript(STANDALONE_VIEW_ELEMENT_ID, view, body)}
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
 * まとめたレイアウトページの URL パス。`/main` `/character` `/sidebar` はそれぞれ単体でも
 * 開けるまま残す（デバッグしやすさのため。`docs/architecture.md`「3つのビューは1枚のページに
 * まとめる」）。実際に利用者が開くのはこちらの1枚。
 */
export const LAYOUT_PATH = "/layout"

/** {@link buildLayoutPage} に渡す、3領域それぞれの最新の本文。 */
export type LayoutBodies = Readonly<Record<ViewName, string>>

/**
 * 3つのビューを1枚の HTML にまとめ、CSS の grid で領域を分けたページ（`docs/requirements.md`
 * 4.7）。**それぞれの領域は、既存の `/events/<view>` を個別に購読する**（3本の SSE。
 * 押す側の `src/view-server.ts` は経路ごとの `publish` をそのまま使えるので、更新の仕組み自体は
 * 増やしていない）。ページを丸ごと再読み込みしないのは `buildViewPage` と同じ理由
 * （`docs/architecture.md`「ビューの更新は Server-Sent Events で押す」）。
 */
export function buildLayoutPage(bodies: LayoutBodies): string {
  const topRow = `<div class="layout-row layout-row-top" id="${LAYOUT_ROW_TOP_ID}">
<section class="layout-region layout-main" id="${layoutRegionId("main")}">${bodies.main}</section>
<div class="layout-resizer layout-resizer-vertical" id="${LAYOUT_RESIZER_TOP_ID}" role="separator" aria-orientation="vertical" aria-label="メインビューとサイドバーの境界"></div>
<section class="layout-region layout-sidebar" id="${layoutRegionId("sidebar")}">${bodies.sidebar}</section>
</div>`

  const bottomRow = `<div class="layout-row layout-row-bottom" id="${LAYOUT_ROW_BOTTOM_ID}">
<section class="layout-region layout-character" id="${layoutRegionId("character")}">${bodies.character}</section>
<div class="layout-resizer layout-resizer-vertical" id="${LAYOUT_RESIZER_BOTTOM_ID}" role="separator" aria-orientation="vertical" aria-label="キャラビューと入力欄の境界"></div>
${dispatchRegionHtml()}
</div>`

  const subscriptions = VIEW_NAMES.map((view) =>
    subscriptionScript(layoutRegionId(view), view, bodies[view]),
  ).join("\n")

  return page(
    "tsukumo",
    `<div class="layout-grid" id="${LAYOUT_GRID_ID}">
${topRow}
<div class="layout-resizer layout-resizer-horizontal" id="${LAYOUT_RESIZER_ROW_ID}" role="separator" aria-orientation="horizontal" aria-label="上段と下段の境界"></div>
${bottomRow}
</div>
<button type="button" id="${LAYOUT_RESET_ID}" class="layout-reset">既定の比率に戻す</button>
<script>
${layoutScript()}
${subscriptions}
${dispatchScript()}
</script>`,
  )
}

function layoutRegionId(view: ViewName): string {
  return `tsukumo-view-${view}`
}

const LAYOUT_GRID_ID = "tsukumo-layout-grid"
const LAYOUT_ROW_TOP_ID = "tsukumo-layout-row-top"
const LAYOUT_ROW_BOTTOM_ID = "tsukumo-layout-row-bottom"
const LAYOUT_RESIZER_ROW_ID = "tsukumo-layout-resizer-row"
const LAYOUT_RESIZER_TOP_ID = "tsukumo-layout-resizer-top"
const LAYOUT_RESIZER_BOTTOM_ID = "tsukumo-layout-resizer-bottom"
const LAYOUT_RESET_ID = "tsukumo-layout-reset"
// ブラウザに覚えさせる仕切りの比率（localStorage）のキー。DISPATCH_TARGET_STORAGE_KEY と同じ考え方
// （サーバ側には状態を持たせない）。
const LAYOUT_SPLIT_STORAGE_KEY = "tsukumo-layout-split"
// 3本の仕切りの既定位置（%）。rowTop は上段(メイン・サイドバー)の高さの割合、topLeft は
// 上段内でのメインの幅の割合、bottomLeft は下段内でのキャラビューの幅の割合
// （残りはそれぞれサイドバー・下段・入力欄に割り当たる）。**下段の高さを広めに取ってあるのは、
// 入力フォームの狭さが既定値を決め直した動機だから**（狭めても構わないが、既定として狭くはしない）。
// **下段の左右は半々**（ユーザーの指定）。
// **STYLE の grid-template-rows / grid-template-columns の var() 第2引数（フォールバック値）と
// 一致させること**（JS が動かない場合の見た目もこの値になる）。
const LAYOUT_SPLIT_DEFAULTS = { rowTop: 60, topLeft: 75, bottomLeft: 50 } as const
// 仕切りをどちらかの端まで詰めて操作不能にしないための可動域。
const LAYOUT_SPLIT_MIN_PERCENT = 15
const LAYOUT_SPLIT_MAX_PERCENT = 85

/**
 * 3本の仕切り（上段の縦・下段の縦・上下の横）をドラッグで動かす配線。**新しい依存は足さず、
 * 素の `pointerdown` / `pointermove` / `pointerup` で書く。**
 *
 * **論点（列の定義の持ち替え）**: 上段（メイン・サイドバー）と下段（キャラビュー・入力欄）で
 * 縦の仕切り位置が違うため、4列共有の `grid-template-columns` では3本の仕切りを独立に動かせない
 * （`docs/requirements.md` 4.7）。ここでは上下の行それぞれを別の grid（`.layout-row-top` /
 * `.layout-row-bottom`）にし、列幅・行の高さを CSS カスタムプロパティで持つ
 * （`--layout-top-left` 等。既定値は STYLE 側の `var()` フォールバックにも重複して書いてあり、
 * `LAYOUT_SPLIT_DEFAULTS` と一致させる必要がある）。ドラッグはこの変数を書き換えるだけで、
 * 実際の列・行のサイズ計算は CSS の grid に任せる。
 *
 * **要素の形が想定と違う（このページの HTML と一緒に配られていない）ときは何もしない。**
 * 描画ループの try/catch を散らすのではなく、`isUsableElement` の判定1箇所で弾く
 * （`docs/coding-standards.md`「エラーハンドリング」と同じ、受け止める場所を1つにする考え方）。
 */
function layoutScript(): string {
  return `  {
    const STORAGE_KEY = ${JSON.stringify(LAYOUT_SPLIT_STORAGE_KEY)}
    const MIN_PERCENT = ${JSON.stringify(LAYOUT_SPLIT_MIN_PERCENT)}
    const MAX_PERCENT = ${JSON.stringify(LAYOUT_SPLIT_MAX_PERCENT)}
    const DEFAULTS = ${JSON.stringify(LAYOUT_SPLIT_DEFAULTS)}

    const grid = document.getElementById(${JSON.stringify(LAYOUT_GRID_ID)})
    const rowTop = document.getElementById(${JSON.stringify(LAYOUT_ROW_TOP_ID)})
    const rowBottom = document.getElementById(${JSON.stringify(LAYOUT_ROW_BOTTOM_ID)})
    const resizerRow = document.getElementById(${JSON.stringify(LAYOUT_RESIZER_ROW_ID)})
    const resizerTop = document.getElementById(${JSON.stringify(LAYOUT_RESIZER_TOP_ID)})
    const resizerBottom = document.getElementById(${JSON.stringify(LAYOUT_RESIZER_BOTTOM_ID)})
    const resetButton = document.getElementById(${JSON.stringify(LAYOUT_RESET_ID)})

    function isUsableElement(value) {
      return value !== null && typeof value === "object" && "style" in value
    }

    if (
      isUsableElement(grid) &&
      isUsableElement(rowTop) &&
      isUsableElement(rowBottom) &&
      isUsableElement(resizerRow) &&
      isUsableElement(resizerTop) &&
      isUsableElement(resizerBottom) &&
      isUsableElement(resetButton)
    ) {
      function isValidPercent(value) {
        return (
          typeof value === "number" &&
          Number.isFinite(value) &&
          value >= MIN_PERCENT &&
          value <= MAX_PERCENT
        )
      }

      function loadSplit() {
        let raw = null
        try {
          raw = localStorage.getItem(STORAGE_KEY)
        } catch {
          return DEFAULTS
        }
        if (raw === null) {
          return DEFAULTS
        }
        try {
          const parsed = JSON.parse(raw)
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            isValidPercent(parsed.rowTop) &&
            isValidPercent(parsed.topLeft) &&
            isValidPercent(parsed.bottomLeft)
          ) {
            return { rowTop: parsed.rowTop, topLeft: parsed.topLeft, bottomLeft: parsed.bottomLeft }
          }
        } catch {
          // 保存値が JSON として壊れている。既定に落ちる。
        }
        return DEFAULTS
      }

      function saveSplit(value) {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
        } catch {
          // プライベートウィンドウなどで書けないだけなので、保存できないまま続ける。
        }
      }

      let split = loadSplit()

      function applySplit() {
        grid.style.setProperty("--layout-row-top", split.rowTop + "fr")
        grid.style.setProperty("--layout-row-bottom", (100 - split.rowTop) + "fr")
        rowTop.style.setProperty("--layout-top-left", split.topLeft + "fr")
        rowTop.style.setProperty("--layout-top-right", (100 - split.topLeft) + "fr")
        rowBottom.style.setProperty("--layout-bottom-left", split.bottomLeft + "fr")
        rowBottom.style.setProperty("--layout-bottom-right", (100 - split.bottomLeft) + "fr")
      }

      applySplit()

      function clampPercent(value) {
        return Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, value))
      }

      function bindResizer(resizer, container, orientation, setPercent) {
        resizer.addEventListener("pointerdown", (event) => {
          if (typeof resizer.setPointerCapture === "function") {
            resizer.setPointerCapture(event.pointerId)
          }
          const rect = container.getBoundingClientRect()

          function onMove(moveEvent) {
            const raw =
              orientation === "horizontal"
                ? ((moveEvent.clientY - rect.top) / rect.height) * 100
                : ((moveEvent.clientX - rect.left) / rect.width) * 100
            setPercent(clampPercent(raw))
            applySplit()
          }
          function onUp() {
            resizer.removeEventListener("pointermove", onMove)
            resizer.removeEventListener("pointerup", onUp)
            saveSplit(split)
          }
          resizer.addEventListener("pointermove", onMove)
          resizer.addEventListener("pointerup", onUp)
        })
      }

      bindResizer(resizerRow, grid, "horizontal", (percent) => {
        split = { ...split, rowTop: percent }
      })
      bindResizer(resizerTop, rowTop, "vertical", (percent) => {
        split = { ...split, topLeft: percent }
      })
      bindResizer(resizerBottom, rowBottom, "vertical", (percent) => {
        split = { ...split, bottomLeft: percent }
      })

      resetButton.addEventListener("click", () => {
        split = DEFAULTS
        applySplit()
        saveSplit(split)
      })
    }
  }`
}

/**
 * 1領域ぶんの SSE 購読スクリプト。`buildViewPage`（単体ページ、要素 id は固定）と
 * `buildLayoutPage`（まとめたレイアウト、要素 id は領域ごと）の両方から使う共通の中身。
 *
 * **本文が前回と同じなら `innerHTML` を差し替えない。** 実機での目視（2026-09-10 報告）で、
 * 更新のたびに画面がチカチカする不具合があった。原因は「押す側（`src/index.ts` の
 * `followTranscript`）が transcript のどんな変化にも反応して3領域まとめて publish する一方、
 * 個々の領域の見た目が実際に変わっている割合はそれよりずっと低い」こと。特にキャラビューは
 * 発話も表情も変わらないまま transcript だけが動く間が長く、そのたびに `.portrait` が
 * 新しい要素として挿入されて CSS のフェードイン（`STYLE` の `portrait-fade-in`）が
 * 再生されていた。**購読を開いた直後の1回目の push**（`view-server.ts` の `openStream` が
 * 接続時点の本文をそのまま返す）も、ページに埋め込み済みの本文と同じなのでここで弾かれる
 * （初回表示の直後にもう1回描き直る、という無駄も無くなる）。
 *
 * サーバ側の協力（変わった部分だけを送る差分化）は行っていない。**クライアント側で
 * このガードを置くだけで、更新の大半（見た目が変わっていない push）が消える**ため
 * （`docs/architecture.md`「ビューの更新は Server-Sent Events で押す」の仕組み自体は変えていない。
 * `publish` 側は毎回まるごとの本文を送ったままでよい）。
 *
 * **差し替えるときはスクロール位置を保つ。** メインビューは作業の進行が積まれる場所なので、
 * `innerHTML` の再代入で読んでいた位置が飛ぶと読めなくなる（`docs/architecture.md`
 * 「ページ全体を再読み込みしない」と同じ理由を、領域の差し替えにも適用する）。差し替え前に
 * いちばん下から24px以内を見ていたら、差し替え後も追従していちばん下へスクロールする。
 * そうでなければ元のスクロール位置をそのまま保つ。**スクロールしている要素**は、差し替える
 * 要素自身が縦にあふれていれば（まとめたレイアウトの `.layout-region` は `overflow-y: auto`）
 * その要素、そうでなければ（単体ページの `<main>` は overflow を指定していないので文書側が
 * スクロールする）`document.scrollingElement` を使う。
 */
function subscriptionScript(elementId: string, view: ViewName, initialBody: string): string {
  return `  {
    const el = document.getElementById(${JSON.stringify(elementId)})
    let lastBody = ${JSON.stringify(initialBody)}
    const source = new EventSource(${JSON.stringify(viewEventPath(view))})
    source.addEventListener("update", (event) => {
      if (event.data === lastBody) {
        return
      }
      const scroller =
        el.scrollHeight > el.clientHeight ? el : (document.scrollingElement ?? document.documentElement)
      const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      const wasNearBottom = distanceFromBottom < 24
      const previousScrollTop = scroller.scrollTop
      el.innerHTML = event.data
      lastBody = event.data
      scroller.scrollTop = wasNearBottom ? scroller.scrollHeight : previousScrollTop
    })
  }`
}

const DISPATCH_FORM_ID = "tsukumo-dispatch-form"
const DISPATCH_TARGET_ID = "tsukumo-dispatch-target"
const DISPATCH_REFRESH_ID = "tsukumo-dispatch-refresh"
const DISPATCH_TEXT_ID = "tsukumo-dispatch-text"
const DISPATCH_SEND_ID = "tsukumo-dispatch-send"
const DISPATCH_STATUS_ID = "tsukumo-dispatch-status"
// ブラウザに選んだ送信先を覚えさせる場所（localStorage）のキー。サーバ側には状態を持たせない
// （docs/architecture.md「HTML はローカルの HTTP サーバから配る」— 本文はメモリにしか持たない、
// という制約に送信先の記憶も揃える）。
const DISPATCH_TARGET_STORAGE_KEY = "tsukumo-dispatch-target"
// 「claude が動いていそう」な送信先の選択肢に付ける印。静的なヒント文（dispatchRegionHtml）と
// 選択肢のラベル（dispatchScript）の両方で同じ文字を使う。
const DISPATCH_LIKELY_MARKER = "★"

/**
 * 右下の空き領域を埋める、依頼の送信フォーム（`docs/requirements.md` 4.7）。送信先の選択は
 * `orca terminal list` から得た一覧を `<select>` に出す（一覧の取得・選択の記憶は
 * {@link dispatchScript} 側の役目。ここは静的なマークアップだけを組み立てる）。
 *
 * **一覧は絞り込まない。** 「claude が動いていそう」（`likelyClaude`）なものは
 * {@link dispatchScript} が上に寄せて印を付けるだけで、選択肢からは消さない
 * （判定を外したときに選べなくならないように）。`.dispatch-hint` はその印の意味を示す
 * 1行だけの補足で、会話の内容は含まない。
 */
function dispatchRegionHtml(): string {
  return `<section class="layout-region layout-dispatch" id="tsukumo-view-dispatch">
<form id="${DISPATCH_FORM_ID}">
  <div class="dispatch-row">
    <select id="${DISPATCH_TARGET_ID}" aria-label="送信先のターミナル"></select>
    <button type="button" id="${DISPATCH_REFRESH_ID}">一覧を更新</button>
  </div>
  <p class="dispatch-hint">${DISPATCH_LIKELY_MARKER} claude が動いていそうな順に並べています（目安。外れていても一覧の他の項目から選べます）</p>
  <textarea id="${DISPATCH_TEXT_ID}" class="dispatch-text" placeholder="claude への依頼を書く" required></textarea>
  <div class="dispatch-row">
    <button type="submit" id="${DISPATCH_SEND_ID}" class="dispatch-send" disabled>送る</button>
    <span id="${DISPATCH_STATUS_ID}" class="dispatch-status" role="status" aria-live="polite"></span>
  </div>
</form>
</section>`
}

/**
 * 送信フォームの配線。**会話の内容（依頼の文面）はブラウザから直接サーバへ POST するだけで、
 * この関数自身（サーバ側で文字列として組み立てる部分）には一切現れない**（docs/coding-standards.md
 * 「会話内容の扱い」）。ここに埋め込むのは経路（`TERMINALS_PATH` / `DISPATCH_PATH`）と要素IDだけ。
 *
 * - **一覧の取得は起動時と「一覧を更新」ボタンの両方で行う。** ターミナルは後から起動されうるので、
 *   ページを開いた時点の一覧を固定にしない
 * - **送信先が1つも無い・一覧の取得に失敗したときは送信ボタンを無効にし、理由を出す**
 *   （壊れて見えないように。`tsukumo terminal list` が失敗する＝ `orca` が無い環境も含む）
 * - **送信中は再度押せないようにし、送信済み／失敗を必ず文字で残す**（送ったのに何も起きない
 *   ように見えないようにする、というこの機能の完了条件）
 * - **「claude が動いていそう」（`terminal.likelyClaude`）は選択肢を消す理由にしない。**
 *   サーバ（`src/view-server.ts` の `sortPanesByLikelyClaude`）が既に上に寄せた順で返すので、
 *   ここでは届いた順番のまま選択肢を並べ、`likelyClaude` が true の項目にだけ
 *   {@link DISPATCH_LIKELY_MARKER} の印を付ける。判定を外していても、印が付かないだけで
 *   一覧からは消えない
 */
function dispatchScript(): string {
  return `  {
    const form = document.getElementById(${JSON.stringify(DISPATCH_FORM_ID)})
    const targetSelect = document.getElementById(${JSON.stringify(DISPATCH_TARGET_ID)})
    const refreshButton = document.getElementById(${JSON.stringify(DISPATCH_REFRESH_ID)})
    const textArea = document.getElementById(${JSON.stringify(DISPATCH_TEXT_ID)})
    const sendButton = document.getElementById(${JSON.stringify(DISPATCH_SEND_ID)})
    const status = document.getElementById(${JSON.stringify(DISPATCH_STATUS_ID)})
    const storageKey = ${JSON.stringify(DISPATCH_TARGET_STORAGE_KEY)}

    function rememberedTarget() {
      try {
        return localStorage.getItem(storageKey)
      } catch {
        return null
      }
    }

    function rememberTarget(id) {
      try {
        localStorage.setItem(storageKey, id)
      } catch {
        // ブラウザの設定で使えないだけなので、記憶できないまま続ける。
      }
    }

    async function loadTerminals() {
      status.textContent = "送信先を取得中…"
      sendButton.disabled = true
      targetSelect.innerHTML = ""

      let data
      try {
        const response = await fetch(${JSON.stringify(TERMINALS_PATH)})
        data = await response.json()
      } catch {
        status.textContent = "送信先の一覧を取得できなかった"
        return
      }

      if (!data.ok) {
        status.textContent = "送信先の一覧を取得できなかった: " + data.reason
        return
      }
      if (data.terminals.length === 0) {
        status.textContent = "動いているターミナルが無い"
        return
      }

      const remembered = rememberedTarget()
      for (const terminal of data.terminals) {
        const option = document.createElement("option")
        option.value = terminal.id
        option.textContent = terminal.likelyClaude
          ? ${JSON.stringify(DISPATCH_LIKELY_MARKER)} + " " + terminal.label
          : terminal.label
        targetSelect.appendChild(option)
      }
      if (remembered !== null && data.terminals.some((terminal) => terminal.id === remembered)) {
        targetSelect.value = remembered
      }

      sendButton.disabled = false
      status.textContent = ""
    }

    refreshButton.addEventListener("click", () => {
      loadTerminals()
    })

    form.addEventListener("submit", async (event) => {
      event.preventDefault()
      const text = textArea.value.trim()
      const terminalId = targetSelect.value
      if (text === "" || terminalId === "") {
        return
      }

      sendButton.disabled = true
      status.textContent = "送信中…"
      try {
        const response = await fetch(${JSON.stringify(DISPATCH_PATH)}, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ terminalId, text }),
        })
        const data = await response.json()
        if (data.ok) {
          rememberTarget(terminalId)
          textArea.value = ""
          status.textContent = "送信済み"
        } else {
          status.textContent = "送信できなかった: " + data.reason
        }
      } catch {
        status.textContent = "送信できなかった"
      } finally {
        sendButton.disabled = false
      }
    })

    loadTerminals()
  }`
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

  // 立ち絵と吹き出しを横並びにする（`.character-layout`。まとめたレイアウト（`buildLayoutPage`）
  // ではキャラビューは下段の半分幅になり、横長・浅めの領域になるため、縦積みのままだと吹き出しの
  // 縦幅が窮屈になる）。幅が足りない環境では `flex-wrap: wrap` で自然に縦積みへ戻る
  // （`docs/requirements.md` 4.7「画面レイアウト」）。
  return `<div class="character-layout">${portraitHtml}<div class="balloon">${escapeHtml(text)}</div></div>`
}

/**
 * メインビューの本文。**「作業中」と「完了後」で状態を切り替えず、ツールの実行と発話の詳細を
 * 時系列でそのまま積む**（理由は `src/transcript.ts` の `extractMainViewEntries` を参照。
 * transcript だけからは2つの状態を確実に判定できないため、無理に分けていない）。
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
  const rendered = entries.flatMap((entry) => mainViewEntryHtml(entry))

  if (rendered.length === 0) {
    return `<p class="placeholder">${escapeHtml(MAIN_VIEW_EMPTY_MESSAGE)}</p>`
  }

  return rendered.join("\n")
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
  .character-layout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }
  .portrait {
    margin: 0;
    flex: 0 0 auto;
    text-align: center;
    animation: portrait-fade-in 0.25s ease-out;
  }
  .portrait svg, .portrait-image {
    display: block;
    width: 100%;
    max-width: 9rem;
    height: auto;
    margin: 0 auto;
  }
  @keyframes portrait-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  .balloon {
    flex: 1 1 11rem;
    min-width: 0;
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

  /* まとめたレイアウト（buildLayoutPage）。上段（メイン・サイドバー）と下段（キャラビュー・
     入力欄）で仕切りの位置を独立に動かせるようにするため、上下の行をそれぞれ別の grid
     （.layout-row-top / .layout-row-bottom）にし、行の高さ・各行の列幅は CSS カスタム
     プロパティで持つ（layoutScript が3本の仕切りのドラッグに応じて書き換える）。
     ここに書いた var() の第2引数（フォールバック値）は layoutScript の既定値
     （LAYOUT_SPLIT_DEFAULTS）と一致させること。 */
  .layout-grid {
    position: relative;
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: var(--layout-row-top, 60fr) auto var(--layout-row-bottom, 40fr);
    gap: 0.5rem;
    /* body の padding（上下 1rem ずつ）ぶんを差し引いて、grid 自体は画面の高さぴったりにする。 */
    height: calc(100vh - 2rem);
  }
  .layout-row {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
    min-height: 0;
  }
  .layout-row-top {
    grid-template-columns: var(--layout-top-left, 75fr) auto var(--layout-top-right, 25fr);
  }
  .layout-row-bottom {
    grid-template-columns: var(--layout-bottom-left, 50fr) auto var(--layout-bottom-right, 50fr);
  }
  .layout-region {
    min-width: 0;
    min-height: 0;
    padding: 0.75rem;
    border: 1px solid #3a4256;
    border-radius: 0.75rem;
    background: #1c202a;
    overflow-y: auto;
  }
  /* 3本の仕切り。auto トラックは仕切り自身の width/height ぶんだけに縮む。 */
  .layout-resizer {
    position: relative;
    touch-action: none;
  }
  .layout-resizer-vertical { width: 0.6rem; cursor: col-resize; }
  .layout-resizer-horizontal { height: 0.6rem; cursor: row-resize; }
  .layout-resizer::after {
    content: "";
    position: absolute;
    background: #3a4256;
  }
  .layout-resizer-vertical::after {
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
  }
  .layout-resizer-horizontal::after {
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    transform: translateY(-50%);
  }
  .layout-resizer:hover::after { background: #8ab4ff; }
  /* 既定の比率に戻す逃げ道。仕切りの上ではなく画面に固定した小さいボタンにして、
     ドラッグ操作と取り合わない場所に置く。 */
  .layout-reset {
    position: fixed;
    right: 0.75rem;
    bottom: 0.75rem;
    z-index: 20;
    padding: 0.3rem 0.6rem;
    background: #1c202a;
    color: inherit;
    border: 1px solid #3a4256;
    border-radius: 0.4rem;
    font: inherit;
    font-size: 0.75rem;
    cursor: pointer;
  }
  .layout-reset:hover { border-color: #8ab4ff; }
  /* 右下の入力ペイン（docs/requirements.md 4.7）。claude への依頼を送るフォームを持つ。 */
  .layout-dispatch form {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 0.5rem;
  }
  .dispatch-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  /* select・button は、他の3領域が使う語彙（#10131a の暗い地、#3a4256 の枠線、0.4remの角丸）に
     揃える。素のブラウザ既定の見た目のままだと、ダークな画面の中でここだけ浮いていた。 */
  .dispatch-row select {
    flex: 1 1 auto;
    min-width: 0;
    padding: 0.4rem 0.5rem;
    background: #10131a;
    color: inherit;
    border: 1px solid #3a4256;
    border-radius: 0.4rem;
    font: inherit;
  }
  .dispatch-row button {
    flex: 0 0 auto;
    padding: 0.4rem 0.75rem;
    background: #1c202a;
    color: inherit;
    border: 1px solid #3a4256;
    border-radius: 0.4rem;
    font: inherit;
    cursor: pointer;
  }
  .dispatch-row button:hover:not(:disabled) { border-color: #8ab4ff; }
  .dispatch-row button:disabled { opacity: 0.5; cursor: default; }
  /* 「送る」は行の主目的なので、リンクと同じ差し色（#8ab4ff）で他のボタンより目立たせる。 */
  .dispatch-send {
    background: #26314a;
    border-color: #8ab4ff;
    font-weight: 600;
  }
  .dispatch-hint { margin: 0; font-size: 0.75rem; color: #8f97ab; }
  .dispatch-text {
    flex: 1 1 auto;
    min-height: 0;
    resize: none;
    padding: 0.5rem;
    background: #10131a;
    color: inherit;
    border: 1px solid #3a4256;
    border-radius: 0.4rem;
    font: inherit;
  }
  .dispatch-status { font-size: 0.8rem; color: #8f97ab; }

  /* grid が窮屈になる幅では、上から メイン→サイドバー→キャラビュー→送信欄 の1列に畳む
     （docs/requirements.md 4.7「狭い画面での崩れ方」）。各行の中身は DOM の並び順どおり
     （main→sidebar、character→dispatch）に積むだけで済むので、grid-template-areas は
     使わない。畳んでいる間は仕切り・既定に戻すボタンを出さない（動かせる比率が無いため）。 */
  @media (max-width: 760px) {
    .layout-grid {
      grid-template-columns: 1fr;
      grid-template-rows: none;
      height: auto;
    }
    .layout-row-top, .layout-row-bottom {
      grid-template-columns: 1fr;
    }
    .layout-resizer, .layout-reset { display: none; }
    .layout-dispatch { min-height: 10rem; }
  }
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

/**
 * 1件の記録から、メインビューに出す HTML を0個か1個返す（`flatMap` で積むための形）。
 * `detail` は常に出す。`tool` は {@link toolVisibility} が「見せない」と決めたら空配列を返し、
 * 呼び出し側（`buildMainBody`）でそのまま消える。
 */
function mainViewEntryHtml(entry: MainViewEntry): readonly string[] {
  if (entry.kind === "detail") {
    return [detailHtml(entry.markdown)]
  }

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
function toolVisibility(entry: Extract<MainViewEntry, { readonly kind: "tool" }>): ToolVisibility {
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
function failedToolHtml(entry: Extract<MainViewEntry, { readonly kind: "tool" }>): string {
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

/**
 * ファイルを変えた操作／サブエージェントの起動の表示。**引数や出力は出さず、
 * ツール名とラベル（パス、またはタスク名）だけを見出しに出す。**
 */
function labeledToolHtml(
  entry: Extract<MainViewEntry, { readonly kind: "tool" }>,
  label: string,
): string {
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

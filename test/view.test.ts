import { describe, expect, it } from "bun:test"
import vm from "node:vm"

import { type MainViewEntry } from "../src/transcript.ts"
import {
  buildCharacterBody,
  buildIndexPage,
  buildLayoutPage,
  buildMainBody,
  buildSidebarBody,
  buildViewPage,
  type CharacterViewData,
  DISPATCH_PATH,
  isViewName,
  LAYOUT_PATH,
  type SidebarData,
  type SubagentActivity,
  TERMINALS_PATH,
  VIEW_NAMES,
  viewEventPath,
  viewPath,
} from "../src/view.ts"

// buildCharacterBody に渡す全部入りのデータ。個々のテストは必要な部分だけ上書きする。
const FULL_CHARACTER_DATA: CharacterViewData = {
  speech: "やあ、調子はどう？",
  portrait: { kind: "svg", svgMarkup: '<svg role="img"><circle r="1"/></svg>' },
  outfitAccent: "#b8c7ff",
  altText: "架空の精霊（通常）",
}

// meta.json が有る（ラベル付き）サブエージェントと、無い（ツール名だけの）サブエージェントを
// 両方含む、手で書いた架空のデータ。
const LABELED_ACTIVITY: SubagentActivity = {
  description: "架空のサイドバー実装",
  model: "sonnet",
  latestToolName: "Bash",
}
const UNLABELED_ACTIVITY: SubagentActivity = {
  description: undefined,
  model: undefined,
  latestToolName: "Edit",
}

// buildSidebarBody に渡す全部入りのデータ。個々のテストは必要な部分だけ上書きする。
const FULL_SIDEBAR_DATA: SidebarData = {
  contextTokens: 603_407,
  subagents: { pendingCount: 2, recentActivity: [LABELED_ACTIVITY, UNLABELED_ACTIVITY] },
  taskCounts: { done: 10, todo: 5 },
}

// --- SSE 購読スクリプトを実際に動かして確かめるための道具 -------------------------------------
//
// 生成された <script> の中身（本番と同じ文字列）を node:vm で実行し、「本文が前回と同じ update
// イベントでは innerHTML を差し替えない」「差し替えるときはスクロール位置を扱う」という
// 制御フローだけを固定する。ブラウザに実際に絵が出ているかどうか（描画そのもの）はここでは
// 確かめない（docs/coding-standards.md「描画は自動テストで守らない」）。

/** subscriptionScript が触るプロパティだけを持つ、テスト用の最小限の要素。 */
type FakeElement = {
  innerHTML: string
  scrollTop: number
  readonly scrollHeight: number
  readonly clientHeight: number
}

type FakeElementHandle = {
  readonly element: FakeElement
  readonly innerHtmlSetCount: () => number
}

/**
 * `innerHTML` への代入回数を数えられる要素を作る。差し替えのたびに scrollTop が 0 に戻る
 * （実ブラウザでも、差し替えで中身が縮んだときなどに起こりうる）ことにして、「差し替え後に
 * スクロール位置を復元しているか」を、値が偶然一致しただけでなくテストで確かめられるようにする。
 */
function makeFakeElement(options: {
  readonly initialHtml: string
  readonly scrollTop: number
  readonly scrollHeight: number
  readonly clientHeight: number
}): FakeElementHandle {
  let html = options.initialHtml
  let scrollTop = options.scrollTop
  let setCount = 0

  const element: FakeElement = {
    get innerHTML(): string {
      return html
    },
    set innerHTML(value: string) {
      html = value
      setCount += 1
      scrollTop = 0
    },
    get scrollTop(): number {
      return scrollTop
    },
    set scrollTop(value: number) {
      scrollTop = value
    },
    scrollHeight: options.scrollHeight,
    clientHeight: options.clientHeight,
  }

  return { element, innerHtmlSetCount: () => setCount }
}

/** vm 実行中に見えてよいだけの、何にでも代入・addEventListener できる無害な代役。 */
type InertStub = { [key: string]: unknown }

function makeInertStub(): InertStub {
  const stub: InertStub = {}
  stub.addEventListener = () => {}
  stub.appendChild = () => {}
  return stub
}

type UpdateEvent = { readonly data: string }

/**
 * `EventSource` の最小限の代役。`url` ごとにハンドラを覚えておき、テスト側から
 * その `url` 宛の update イベントを個別に発火できる（まとめたレイアウトページは
 * 領域ごとに別々の `EventSource` を作るため）。
 */
function makeFakeEventSourceController(): {
  readonly EventSourceClass: new (url: string) => {
    readonly addEventListener: (type: string, listener: (event: UpdateEvent) => void) => void
  }
  readonly dispatch: (url: string, data: string) => void
} {
  const handlers = new Map<string, (event: UpdateEvent) => void>()

  class FakeEventSource {
    private readonly url: string

    constructor(url: string) {
      this.url = url
    }

    addEventListener(_type: string, listener: (event: UpdateEvent) => void): void {
      handlers.set(this.url, listener)
    }
  }

  return {
    EventSourceClass: FakeEventSource,
    dispatch: (url, data) => {
      handlers.get(url)?.({ data })
    },
  }
}

/**
 * ページ全体の HTML から `<script>` の中身を取り出し、渡した要素だけを本物として、
 * それ以外の id は無害な代役（{@link makeInertStub}）で埋めて実行する。まとめたレイアウトの
 * ページには送信フォームの配線（`dispatchScript`）も同じ `<script>` に同居しているため、
 * そちらが参照する要素・`fetch` が無くても（`fetch` は未定義のまま呼ばれて例外になるが、
 * 元の実装が try/catch で握っている）落ちずに済むようにする。
 */
function runSubscriptionScript(
  page: string,
  elements: ReadonlyMap<string, FakeElement>,
): { readonly dispatch: (url: string, data: string) => void } {
  const scriptMatch = /<script>([\s\S]*)<\/script>/.exec(page)
  if (scriptMatch === null || scriptMatch[1] === undefined) {
    throw new Error("ページに <script> が無い")
  }

  const controller = makeFakeEventSourceController()
  // 単体ページの <main> のように、要素自身が縦にあふれていないときのスクロール先
  // （document.scrollingElement の代役）。テスト対象の要素をそのまま使う
  // （実ページでは文書側だが、テストでは「差し替える要素自身」で代用しても、
  //  スクロール位置を扱うかどうかの判定には影響しない）。
  const fallbackScroller = elements.values().next().value ?? {
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
  }
  const documentStub = {
    getElementById: (id: string) => elements.get(id) ?? makeInertStub(),
    scrollingElement: fallbackScroller,
    documentElement: fallbackScroller,
  }

  vm.runInNewContext(scriptMatch[1], {
    document: documentStub,
    EventSource: controller.EventSourceClass,
  })

  return { dispatch: controller.dispatch }
}

describe("SSEの更新の適用（本文が同じなら差し替えない・スクロール位置を保つ）", () => {
  it("購読直後の1回目の push が、埋め込み済みの本文と同じときは innerHTML を差し替えない", () => {
    const initialBody = "<p>さいしょ</p>"
    const page = buildViewPage("character", initialBody)
    const { element, innerHtmlSetCount } = makeFakeElement({
      initialHtml: initialBody,
      scrollTop: 0,
      scrollHeight: 100,
      clientHeight: 100,
    })

    const { dispatch } = runSubscriptionScript(page, new Map([["tsukumo-view", element]]))
    dispatch(viewEventPath("character"), initialBody)

    expect(innerHtmlSetCount()).toBe(0)
  })

  it("本文が前回と同じ update イベントが続いても、差し替えは起きない", () => {
    const initialBody = "<p>さいしょ</p>"
    const page = buildViewPage("main", initialBody)
    const { element, innerHtmlSetCount } = makeFakeElement({
      initialHtml: initialBody,
      scrollTop: 0,
      scrollHeight: 100,
      clientHeight: 100,
    })

    const { dispatch } = runSubscriptionScript(page, new Map([["tsukumo-view", element]]))
    dispatch(viewEventPath("main"), initialBody)
    dispatch(viewEventPath("main"), initialBody)
    dispatch(viewEventPath("main"), initialBody)

    expect(innerHtmlSetCount()).toBe(0)
  })

  it("本文が変わった update イベントでは innerHTML を差し替える", () => {
    const initialBody = "<p>さいしょ</p>"
    const page = buildViewPage("main", initialBody)
    const { element, innerHtmlSetCount } = makeFakeElement({
      initialHtml: initialBody,
      scrollTop: 0,
      scrollHeight: 100,
      clientHeight: 100,
    })

    const { dispatch } = runSubscriptionScript(page, new Map([["tsukumo-view", element]]))
    dispatch(viewEventPath("main"), "<p>つぎ</p>")

    expect(innerHtmlSetCount()).toBe(1)
    expect(element.innerHTML).toBe("<p>つぎ</p>")
  })

  it("差し替え前にいちばん下から24px以内を見ていたときは、差し替え後もいちばん下へ追従する", () => {
    const initialBody = "<p>さいしょ</p>"
    const page = buildViewPage("main", initialBody)
    const { element } = makeFakeElement({
      initialHtml: initialBody,
      scrollTop: 980, // 1000 - 980 - 100 = -80 < 24 → いちばん下の近く
      scrollHeight: 1000,
      clientHeight: 100,
    })

    const { dispatch } = runSubscriptionScript(page, new Map([["tsukumo-view", element]]))
    dispatch(viewEventPath("main"), "<p>つぎ</p>")

    expect(element.scrollTop).toBe(1000)
  })

  it("差し替え前にいちばん下から離れていたときは、差し替え後も元のスクロール位置を保つ", () => {
    const initialBody = "<p>さいしょ</p>"
    const page = buildViewPage("main", initialBody)
    const { element } = makeFakeElement({
      initialHtml: initialBody,
      scrollTop: 100, // 1000 - 100 - 100 = 800 ≥ 24 → 離れている
      scrollHeight: 1000,
      clientHeight: 100,
    })

    const { dispatch } = runSubscriptionScript(page, new Map([["tsukumo-view", element]]))
    dispatch(viewEventPath("main"), "<p>つぎ</p>")

    // 差し替え自体は scrollTop を 0 に戻す（makeFakeElement の側の想定）ので、
    // 100 のままなら「明示的に復元している」ことの証拠になる。
    expect(element.scrollTop).toBe(100)
  })

  it("まとめたレイアウトページでは、領域ごとに独立して差し替えの要否とスクロール位置を扱う", () => {
    const bodies = { main: "<p>main1</p>", character: "<p>char1</p>", sidebar: "<p>side1</p>" }
    const page = buildLayoutPage(bodies)

    const main = makeFakeElement({
      initialHtml: bodies.main,
      scrollTop: 0,
      scrollHeight: 1000,
      clientHeight: 100,
    })
    const character = makeFakeElement({
      initialHtml: bodies.character,
      scrollTop: 0,
      scrollHeight: 1000,
      clientHeight: 100,
    })

    const { dispatch } = runSubscriptionScript(
      page,
      new Map([
        ["tsukumo-view-main", main.element],
        ["tsukumo-view-character", character.element],
      ]),
    )

    // main と同じ本文の push は main 領域を差し替えない。
    dispatch(viewEventPath("main"), bodies.main)
    expect(main.innerHtmlSetCount()).toBe(0)

    // character だけ違う本文が届いても、main 領域には影響しない。
    dispatch(viewEventPath("character"), "<p>char2</p>")
    expect(character.innerHtmlSetCount()).toBe(1)
    expect(character.element.innerHTML).toBe("<p>char2</p>")
    expect(main.innerHtmlSetCount()).toBe(0)
  })
})

describe("ビューの経路", () => {
  it("ページと更新の経路が、ビューごとに別々になる", () => {
    const paths = VIEW_NAMES.map((view) => viewPath(view))
    const eventPaths = VIEW_NAMES.map((view) => viewEventPath(view))

    expect(new Set([...paths, ...eventPaths]).size).toBe(paths.length + eventPaths.length)
  })

  it("知らないビュー名を弾く", () => {
    expect(isViewName("character")).toBe(true)
    expect(isViewName("balloon")).toBe(false)
  })
})

describe("ビューのページ", () => {
  it("本文を埋め込み、そのビューの更新の経路を購読する", () => {
    const page = buildViewPage("character", "<p>こんにちは</p>")

    expect(page).toStartWith("<!doctype html>")
    expect(page).toContain("<p>こんにちは</p>")
    expect(page).toContain(`new EventSource("${viewEventPath("character")}")`)
  })

  it("一覧ページから3つのビューすべてに辿れる", () => {
    const page = buildIndexPage()

    for (const view of VIEW_NAMES) {
      expect(page).toContain(`href="${viewPath(view)}"`)
    }
  })
})

describe("まとめたレイアウトページ", () => {
  it("経路が個別のビューのページ・更新の経路と重ならない", () => {
    const paths = [
      ...VIEW_NAMES.map((view) => viewPath(view)),
      ...VIEW_NAMES.map((view) => viewEventPath(view)),
    ]

    expect(paths).not.toContain(LAYOUT_PATH)
  })

  it("3領域それぞれの本文を、対応する id の要素に埋め込む", () => {
    const page = buildLayoutPage({
      main: "<p>作業ちゅう</p>",
      character: "<p>やあ</p>",
      sidebar: "<p>done 1 / todo 2</p>",
    })

    expect(page).toContain(
      '<section class="layout-region layout-main" id="tsukumo-view-main"><p>作業ちゅう</p></section>',
    )
    expect(page).toContain(
      '<section class="layout-region layout-character" id="tsukumo-view-character"><p>やあ</p></section>',
    )
    expect(page).toContain(
      '<section class="layout-region layout-sidebar" id="tsukumo-view-sidebar"><p>done 1 / todo 2</p></section>',
    )
  })

  it("3領域それぞれが、既存の /events/<view> を個別に購読して自分の要素だけを差し替える", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

    for (const view of VIEW_NAMES) {
      expect(page).toContain(`new EventSource(${JSON.stringify(viewEventPath(view))})`)
      expect(page).toContain(`document.getElementById("tsukumo-view-${view}")`)
    }
  })

  it("右下の入力ペインに、送信先の選択と依頼を書くフォームを持つ", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

    expect(page).toContain('<section class="layout-region layout-dispatch"')
    expect(page).toContain('<form id="tsukumo-dispatch-form">')
    expect(page).toContain('<select id="tsukumo-dispatch-target"')
    expect(page).toContain('<textarea id="tsukumo-dispatch-text"')
  })

  it("送信先の一覧の取得と依頼の送信を、経路の定数（TERMINALS_PATH / DISPATCH_PATH）宛に行う", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

    expect(page).toContain(`fetch(${JSON.stringify(TERMINALS_PATH)})`)
    expect(page).toContain(`fetch(${JSON.stringify(DISPATCH_PATH)}`)
  })

  it("送信先が0件のとき・一覧の取得や送信に失敗したときに出す理由の文言を持つ", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

    expect(page).toContain("動いているターミナルが無い")
    expect(page).toContain("送信先の一覧を取得できなかった")
    expect(page).toContain("送信できなかった")
  })

  it("送信ボタンは初期状態で無効になっている（送信先が揃うまで押せない）", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

    expect(page).toContain('<button type="submit" id="tsukumo-dispatch-send" disabled>')
  })
})

describe("メインビューの本文", () => {
  it("記録が1つも無いとき、まだ何もないことだけを出す", () => {
    expect(buildMainBody([])).toContain("まだ作業がありません")
  })

  it("ファイルを変えた操作（Write/Edit/NotebookEdit）は、ツール名とパスだけを出す", () => {
    const entries: readonly MainViewEntry[] = [
      {
        kind: "tool",
        name: "Edit",
        input: { file_path: "src/view.ts", old_string: "a", new_string: "b" },
        result: { content: "The file has been updated", isError: false },
      },
      {
        kind: "tool",
        name: "Write",
        input: { file_path: "src/new.ts", content: "export {}" },
        result: { content: "File created", isError: false },
      },
      {
        kind: "tool",
        name: "NotebookEdit",
        input: { notebook_path: "note.ipynb", new_source: "1+1" },
        result: { content: "ok", isError: false },
      },
    ]

    const body = buildMainBody(entries)

    expect(body).toContain("Edit: src/view.ts")
    expect(body).toContain("Write: src/new.ts")
    expect(body).toContain("NotebookEdit: note.ipynb")
    // 引数・結果の中身は出ない。
    expect(body).not.toContain("old_string")
    expect(body).not.toContain("The file has been updated")
    expect(body).not.toContain("export {}")
  })

  it("ファイルを変えた操作で、結果がまだ届いていないものは実行中と出す", () => {
    const entries: readonly MainViewEntry[] = [
      { kind: "tool", name: "Edit", input: { file_path: "src/view.ts" }, result: undefined },
    ]

    const body = buildMainBody(entries)

    expect(body).toContain("Edit: src/view.ts")
    expect(body).toContain("実行中")
  })

  it("コマンド（Bash）とその出力は、成功していれば出ない", () => {
    const entries: readonly MainViewEntry[] = [
      {
        kind: "tool",
        name: "Bash",
        input: { command: "echo hi" },
        result: { content: "hi", isError: false },
      },
    ]

    const body = buildMainBody(entries)

    expect(body).not.toContain("Bash")
    expect(body).not.toContain("echo hi")
    expect(body).not.toContain(">hi<")
  })

  it("読み取り・検索（Read/Grep 等）は成功していれば出ない", () => {
    const entries: readonly MainViewEntry[] = [
      {
        kind: "tool",
        name: "Read",
        input: { file_path: "/a" },
        result: { content: "中身", isError: false },
      },
      {
        kind: "tool",
        name: "Grep",
        input: { pattern: "foo" },
        result: { content: "1件", isError: false },
      },
    ]

    const body = buildMainBody(entries)

    expect(body).not.toContain("Read")
    expect(body).not.toContain("Grep")
  })

  it("未知のツール名は、成功していれば出ない側に倒れる（安全側）", () => {
    const entries: readonly MainViewEntry[] = [
      {
        kind: "tool",
        name: "SomeFutureTool",
        input: { anything: "x" },
        result: { content: "done", isError: false },
      },
    ]

    expect(buildMainBody(entries)).not.toContain("SomeFutureTool")
  })

  it("失敗したツールは、種類によらずエラーの内容込みで出す", () => {
    const entries: readonly MainViewEntry[] = [
      {
        kind: "tool",
        name: "Bash",
        input: { command: "exit 1" },
        result: { content: "command not found", isError: true },
      },
      {
        kind: "tool",
        name: "Read",
        input: { file_path: "/missing" },
        result: { content: "No such file", isError: true },
      },
    ]

    const body = buildMainBody(entries)

    expect(body).toContain("tool-error")
    expect(body).toContain("exit 1")
    expect(body).toContain("command not found")
    expect(body).toContain("No such file")
  })

  it("サブエージェントの起動は、タスク名込みで出す", () => {
    const entries: readonly MainViewEntry[] = [
      {
        kind: "tool",
        name: "Agent",
        input: { description: "テストを直す", prompt: "テストの中身は出さない秘密" },
        result: undefined,
      },
    ]

    const body = buildMainBody(entries)

    expect(body).toContain("Agent: テストを直す")
    expect(body).toContain("実行中")
    expect(body).not.toContain("テストの中身は出さない秘密")
  })

  it("サブエージェントの起動で description が無いときも、列から消さずツール名は出す", () => {
    const entries: readonly MainViewEntry[] = [
      { kind: "tool", name: "Agent", input: {}, result: undefined },
    ]

    expect(buildMainBody(entries)).toContain("タスク名不明")
  })

  it("ファイルを変えた操作で file_path が無い（壊れた入力）ときも、ツール名は出す", () => {
    const entries: readonly MainViewEntry[] = [
      { kind: "tool", name: "Write", input: {}, result: undefined },
    ]

    expect(buildMainBody(entries)).toContain("パス不明")
  })

  it("エラーになったツールの結果には、そうと分かる印を付ける", () => {
    const entries: readonly MainViewEntry[] = [
      {
        kind: "tool",
        name: "Bash",
        input: {},
        result: { content: "command not found", isError: true },
      },
    ]

    expect(buildMainBody(entries)).toContain("tool-error")
  })

  it("失敗したツールの引数・出力を HTML として無害な形にして埋め込む", () => {
    const entries: readonly MainViewEntry[] = [
      {
        kind: "tool",
        name: "Bash",
        input: { command: '<script>alert("x")</script>' },
        result: { content: '<img src=x onerror="alert(1)">', isError: true },
      },
    ]

    const body = buildMainBody(entries)

    expect(body).not.toContain("<script>")
    expect(body).not.toContain('<img src=x onerror="alert(1)">')
    expect(body).toContain("&lt;script&gt;")
    expect(body).toContain("&lt;img")
  })

  it("ファイルを変えた操作のパスを HTML として無害な形にして埋め込む", () => {
    const entries: readonly MainViewEntry[] = [
      {
        kind: "tool",
        name: "Edit",
        input: { file_path: '<script>alert("x")</script>' },
        result: undefined,
      },
    ]

    const body = buildMainBody(entries)

    expect(body).not.toContain("<script>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("ツールの実行と発話の詳細を出現順のまま積む（状態を切り替えない）", () => {
    const entries: readonly MainViewEntry[] = [
      {
        kind: "tool",
        name: "Edit",
        input: { file_path: "src/view.ts" },
        result: { content: "ok", isError: false },
      },
      { kind: "detail", markdown: "終わったよ" },
    ]

    const body = buildMainBody(entries)

    expect(body.indexOf("Edit")).toBeLessThan(body.indexOf("終わったよ"))
  })

  it("見えるツールの実行が1つも無いときも、まだ何もないことだけを出す", () => {
    const entries: readonly MainViewEntry[] = [
      {
        kind: "tool",
        name: "Bash",
        input: { command: "ls" },
        result: { content: "a.txt", isError: false },
      },
    ]

    expect(buildMainBody(entries)).toContain("まだ作業がありません")
  })

  it("発話の詳細（Markdown）を見出し・箇条書き・表・コードブロックが読める HTML に整形する", () => {
    const markdown = [
      "## 見出し",
      "",
      "- 箇条書き1",
      "- 箇条書き2",
      "",
      "| 列A | 列B |",
      "| --- | --- |",
      "| a | b |",
      "",
      "```ts",
      "const x = 1",
      "```",
      "",
      "**強調**と`インラインコード`。",
    ].join("\n")
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).toContain("<h2>見出し</h2>")
    expect(body).toContain("<ul><li>箇条書き1</li><li>箇条書き2</li></ul>")
    expect(body).toContain("<table>")
    expect(body).toContain("<th>列A</th>")
    expect(body).toContain("<td>a</td>")
    expect(body).toContain("<pre><code")
    expect(body).toContain("const x = 1")
    expect(body).toContain("<strong>強調</strong>")
    expect(body).toContain("<code>インラインコード</code>")
  })

  it("http: / https: と、/ や # で始まる相対リンクはリンクとして出す", () => {
    const markdown = [
      "[絶対](https://example.com)",
      "[素のhttp](http://example.com)",
      "[メール](mailto:a@example.com)",
      "[相対](/foo/bar)",
      "[アンカー](#section)",
    ].join("\n\n")
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).toContain('<a href="https://example.com" rel="noopener noreferrer">絶対</a>')
    expect(body).toContain('<a href="http://example.com" rel="noopener noreferrer">素のhttp</a>')
    expect(body).toContain('<a href="mailto:a@example.com" rel="noopener noreferrer">メール</a>')
    expect(body).toContain('<a href="/foo/bar" rel="noopener noreferrer">相対</a>')
    expect(body).toContain('<a href="#section" rel="noopener noreferrer">アンカー</a>')
  })

  it("javascript: リンクはクリックしても実行されないよう、リンクにせず見た目のまま平文で出す（隣の正当なリンクはそのままリンクになる）", () => {
    const markdown = "[クリック](javascript:alert(1)) と [ふつう](https://example.com)"
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).not.toContain('href="javascript:')
    expect(body).toContain("[クリック](javascript:alert(1))")
    expect(body).toContain('<a href="https://example.com" rel="noopener noreferrer">ふつう</a>')
  })

  it("スキームの大文字小文字を無視して判定する（JavaScript: も弾く）", () => {
    const markdown = "[大文字](JavaScript:alert(1))"
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).not.toContain("<a href")
    expect(body).toContain("[大文字](JavaScript:alert(1))")
  })

  it("data: など allowlist に無いスキームもリンクにしない", () => {
    const markdown = "[data](data:text/html,hi)"
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).not.toContain("<a href")
    expect(body).toContain("[data](data:text/html,hi)")
  })

  it("Markdown のコードブロックの中身も escape する（コード中の HTML がそのまま出ない）", () => {
    const markdown = ["```html", '<script>alert("x")</script>', "```"].join("\n")
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).not.toContain("<script>alert")
    expect(body).toContain("&lt;script&gt;")
  })

  it("対応していない Markdown 記法（引用など）は、崩れた見た目になるだけで表示は壊れない", () => {
    const markdown = "> これは対応していない引用記法\n地の文"
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).toContain("これは対応していない引用記法")
    expect(body).toContain("地の文")
  })

  it("巨大なツール出力を食わせても表示が壊れない（切り詰めて表示する）", () => {
    const hugeOutput = "x".repeat(200_000)
    const entries: readonly MainViewEntry[] = [
      { kind: "tool", name: "Bash", input: {}, result: { content: hugeOutput, isError: true } },
    ]

    const body = buildMainBody(entries)

    expect(body.length).toBeLessThan(hugeOutput.length)
    expect(body).toContain("省略")
  })

  it("巨大な Markdown の詳細を食わせても表示が壊れない", () => {
    const hugeMarkdown = Array.from({ length: 5000 }, (_, index) => `行${String(index)}`).join("\n")
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown: hugeMarkdown }]

    expect(() => buildMainBody(entries)).not.toThrow()
    expect(buildMainBody(entries).length).toBeLessThan(hugeMarkdown.length)
  })
})

describe("キャラビューの本文", () => {
  it("セリフをそのまま出さず、HTML として無害な形にして埋め込む", () => {
    const body = buildCharacterBody({
      ...FULL_CHARACTER_DATA,
      speech: '<script>alert("x")</script>',
    })

    expect(body).not.toContain("<script>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("セリフがまだ無い（一度も発話が無い）ときはプレースホルダを出す", () => {
    const body = buildCharacterBody({ ...FULL_CHARACTER_DATA, speech: undefined })

    expect(body).toContain("まだ発話がありません")
  })

  it("インライン SVG の立ち絵は、エスケープせずファイルの中身をそのまま埋め込む", () => {
    const body = buildCharacterBody(FULL_CHARACTER_DATA)

    expect(body).toContain('<svg role="img"><circle r="1"/></svg>')
  })

  it("差し色を立ち絵のラッパーに CSS 変数として渡す", () => {
    const body = buildCharacterBody(FULL_CHARACTER_DATA)

    expect(body).toContain('style="--outfit-accent: #b8c7ff;"')
  })

  it("alt テキストをラッパーの aria-label にも出す", () => {
    const body = buildCharacterBody(FULL_CHARACTER_DATA)

    expect(body).toContain('aria-label="架空の精霊（通常）"')
  })

  it("ラスタ画像の立ち絵は <img> の data URI で出す（差し色は渡さない意味は無いが埋め込む）", () => {
    const body = buildCharacterBody({
      ...FULL_CHARACTER_DATA,
      portrait: { kind: "image", dataUri: "data:image/png;base64,QUJD" },
    })

    expect(body).toContain('<img class="portrait-image" src="data:image/png;base64,QUJD"')
    expect(body).toContain('alt="架空の精霊（通常）"')
  })

  it("立ち絵の素材が無い（portrait が undefined）ときは、吹き出しだけで成立する", () => {
    const body = buildCharacterBody({ ...FULL_CHARACTER_DATA, portrait: undefined })

    expect(body).not.toContain("<svg")
    expect(body).not.toContain("<img")
    expect(body).toContain('<div class="balloon">')
    expect(body).toContain("やあ、調子はどう？")
  })

  it("差し色が無いときは style 属性ごと省略する", () => {
    const body = buildCharacterBody({ ...FULL_CHARACTER_DATA, outfitAccent: undefined })

    expect(body).not.toContain("--outfit-accent")
  })
})

describe("サイドバーの本文", () => {
  it("3つの区画（コンテキスト使用量・サブエージェント・タスクの進捗）を並べる", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("コンテキスト使用量")
    expect(body).toContain("サブエージェント")
    expect(body).toContain("タスクの進捗")
  })

  it("コンテキスト使用量は3桁区切りで出し、残量%は出さない", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("603,407")
    expect(body).not.toContain("%")
  })

  it("サブエージェントの保留件数を出す", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("2件")
  })

  it("meta.json のあるサブエージェントは、ラベル(description)・model・直近のツール名を1行で出す", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("<li>架空のサイドバー実装 (sonnet) — Bash</li>")
  })

  it("meta.json の無いサブエージェントは、列から消さずツール名だけで出す", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("<li>Edit</li>")
  })

  it("タスクの進捗は done / todo の件数を出す", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("10")
    expect(body).toContain("5")
  })

  it("直近の活動のラベル・ツール名を、HTML として無害な形にして埋め込む", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      subagents: {
        pendingCount: 1,
        recentActivity: [
          {
            description: '<script>alert("x")</script>',
            model: undefined,
            latestToolName: undefined,
          },
        ],
      },
    })

    expect(body).not.toContain("<script>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("コンテキスト使用量が取れないとき、その区画だけ「不明」を出し、残りは壊れない", () => {
    const body = buildSidebarBody({ ...FULL_SIDEBAR_DATA, contextTokens: undefined })

    expect(body).toContain("不明")
    expect(body).toContain("10")
    expect(body).toContain("<li>Edit</li>")
  })

  it("pendingBackgroundAgentCount が1行も無い（保留件数が取れない）とき、その旨を出し、残りは壊れない", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      subagents: { pendingCount: undefined, recentActivity: [] },
    })

    expect(body).toContain("不明")
    expect(body).toContain("直近の活動なし")
    expect(body).toContain("603,407")
  })

  it("develop/tasks.json が読めない（taskCounts が undefined）とき、その区画だけ「不明」を出し、残りは壊れない", () => {
    const body = buildSidebarBody({ ...FULL_SIDEBAR_DATA, taskCounts: undefined })

    expect(body).toContain("不明")
    expect(body).toContain("603,407")
    expect(body).toContain("<li>Edit</li>")
  })

  it("すべて取れないときも例外を投げずに組み立てる", () => {
    const body = buildSidebarBody({
      contextTokens: undefined,
      subagents: { pendingCount: undefined, recentActivity: [] },
      taskCounts: undefined,
    })

    expect(body).toContain("コンテキスト使用量")
    expect(body).toContain("サブエージェント")
    expect(body).toContain("タスクの進捗")
  })
})

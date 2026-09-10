import { describe, expect, it } from "bun:test"
import vm from "node:vm"

import { type MainViewEntry } from "../src/transcript.ts"
import {
  buildCharacterBody,
  buildIndexPage,
  buildLayoutPage,
  buildMainBody,
  buildQuestionBody,
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
  // メインビューのタブ制御（mainTurnsScript）が触る分。ここでは「タブが1つも無い本文」として
  // 振る舞わせ、スクロール位置の扱いだけをこの代役で確かめる。
  readonly addEventListener: () => void
  readonly querySelector: () => null
  readonly querySelectorAll: () => readonly never[]
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
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
  }

  return { element, innerHtmlSetCount: () => setCount }
}

/** vm 実行中に見えてよいだけの、何にでも代入・addEventListener できる無害な代役。 */
type InertStub = { [key: string]: unknown }

function makeInertStub(): InertStub {
  const stub: InertStub = {}
  stub.addEventListener = () => {}
  stub.appendChild = () => {}
  // メインビューのタブ制御（mainTurnsScript）と質問の領域（questionRegionScript）が触る
  // 最小限。無害な「何も無い」を返す。
  stub.querySelector = () => null
  stub.querySelectorAll = () => []
  stub.innerHTML = ""
  return stub
}

/**
 * `MutationObserver` の最小限の代役。ブラウザでは本文の差し替え（`innerHTML` の再代入）で
 * 自動的に発火するが、テストでは `trigger()` で明示的に起こす。
 */
function makeFakeMutationObserverController(): {
  readonly MutationObserverClass: new (callback: () => void) => { readonly observe: () => void }
  readonly trigger: () => void
} {
  const callbacks: (() => void)[] = []

  class FakeMutationObserver {
    constructor(callback: () => void) {
      callbacks.push(callback)
    }

    observe(): void {}
  }

  return {
    MutationObserverClass: FakeMutationObserver,
    trigger: () => {
      for (const callback of callbacks) {
        callback()
      }
    },
  }
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
    MutationObserver: makeFakeMutationObserverController().MutationObserverClass,
  })

  return { dispatch: controller.dispatch }
}

// --- 送信フォーム（dispatchScript）を実際に動かして確かめるための道具 -------------------------
//
// 「claude が動いていそう」（likelyClaude）の判定は、選択肢を絞り込む理由にしてはいけない
// （判定を外したときに選べなくなるため）。ここでは `/api/terminals` の応答を差し替えて
// `loadTerminals()` を実際に走らせ、届いた送信先が1件も消えずに `<option>` になること・
// 印（DISPATCH_LIKELY_MARKER）の付け方だけを確かめる。実際に選べて見えるかはブラウザでの
// 目視確認に任せる（docs/coding-standards.md「描画は自動テストで守らない」）。

type FakeOptionElement = { value: string; textContent: string }

/** `<select id="tsukumo-dispatch-target">` の代役。dispatchScript が触る範囲だけを持つ。 */
type FakeSelectElement = {
  value: string
  innerHTML: string
  readonly appendChild: (child: FakeOptionElement) => void
  readonly appendedOptions: () => readonly FakeOptionElement[]
}

function makeFakeSelectElement(): FakeSelectElement {
  const options: FakeOptionElement[] = []
  return {
    value: "",
    innerHTML: "",
    appendChild: (child) => {
      options.push(child)
    },
    appendedOptions: () => options,
  }
}

/** `<span id="tsukumo-dispatch-status">` の代役。 */
type FakeTextElement = { textContent: string }

function makeFakeTextElement(): FakeTextElement {
  return { textContent: "" }
}

/** `<button id="tsukumo-dispatch-send">` の代役。クリックは発火させないので addEventListener は無害。 */
type FakeButtonElement = {
  disabled: boolean
  readonly addEventListener: (type: string, listener: () => void) => void
}

function makeFakeButtonElement(): FakeButtonElement {
  return { disabled: false, addEventListener: () => {} }
}

type FakeDispatchElement = FakeSelectElement | FakeTextElement | FakeButtonElement

type TerminalsPayload =
  | {
      readonly ok: true
      readonly terminals: readonly {
        readonly id: string
        readonly label: string
        readonly likelyClaude: boolean
      }[]
    }
  | { readonly ok: false; readonly reason: string }

/**
 * まとめたレイアウトページの `<script>`（3領域ぶんの購読と送信フォームの配線が同居する）を
 * 実際に動かし、`loadTerminals()` が完了するまで待つ。3領域の購読が参照する要素・
 * `EventSource` は無害な代役で埋める（{@link runSubscriptionScript} と同じ考え方）。
 */
async function runDispatchScript(
  page: string,
  options: {
    readonly targetSelect: FakeSelectElement
    readonly status: FakeTextElement
    readonly sendButton: FakeButtonElement
    readonly terminalsResponse: TerminalsPayload
  },
): Promise<void> {
  const scriptMatch = /<script>([\s\S]*)<\/script>/.exec(page)
  if (scriptMatch === null || scriptMatch[1] === undefined) {
    throw new Error("ページに <script> が無い")
  }

  const elements = new Map<string, FakeDispatchElement>([
    ["tsukumo-dispatch-target", options.targetSelect],
    ["tsukumo-dispatch-status", options.status],
    ["tsukumo-dispatch-send", options.sendButton],
  ])
  const controller = makeFakeEventSourceController()
  const fallback = makeInertStub()

  const documentStub = {
    getElementById: (id: string) => elements.get(id) ?? makeInertStub(),
    createElement: (_tagName: string): FakeOptionElement => ({ value: "", textContent: "" }),
    scrollingElement: fallback,
    documentElement: fallback,
  }
  const fetchStub = (_url: string): Promise<{ json: () => Promise<TerminalsPayload> }> =>
    Promise.resolve({ json: () => Promise.resolve(options.terminalsResponse) })
  // 記憶（localStorage）はこのテストの関心事ではないので、常に「覚えていない」ものとして扱う。
  const localStorageStub = { getItem: () => null, setItem: () => {} }

  vm.runInNewContext(scriptMatch[1], {
    document: documentStub,
    EventSource: controller.EventSourceClass,
    MutationObserver: makeFakeMutationObserverController().MutationObserverClass,
    fetch: fetchStub,
    localStorage: localStorageStub,
  })

  // loadTerminals() 内の await（fetch → response.json()）が解決するまでイベントループを進める。
  await new Promise((resolve) => setTimeout(resolve, 0))
}

// --- 3本の仕切り（layoutScript）を実際に動かして確かめるための道具 -----------------------------
//
// pointerdown → pointermove → pointerup を手で発火させ、「ドラッグで CSS カスタムプロパティが
// 変わる」「離した時点で localStorage に保存する」「保存値が壊れていても既定に落ちる」を
// 実際のスクリプトの中身で確かめる。実際にブラウザ上でドラッグして見えるかは目視確認に任せる
// （docs/coding-standards.md「描画は自動テストで守らない」）。

/** `style.setProperty` を記録するだけの代役。CSS が実際に効くかどうかまでは確かめない。 */
type FakeStyle = {
  readonly setProperty: (name: string, value: string) => void
  readonly values: () => Readonly<Record<string, string>>
}

function makeFakeStyle(): FakeStyle {
  const values: Record<string, string> = {}
  return {
    setProperty: (name, value) => {
      values[name] = value
    },
    values: () => ({ ...values }),
  }
}

/** `.layout-grid` / `.layout-row-*` の代役。仕切りのドラッグ元になる要素の矩形を固定で返す。 */
type FakeLayoutContainer = {
  readonly style: FakeStyle
  readonly getBoundingClientRect: () => { top: number; left: number; width: number; height: number }
}

function makeFakeLayoutContainer(rect: {
  readonly top: number
  readonly left: number
  readonly width: number
  readonly height: number
}): FakeLayoutContainer {
  return { style: makeFakeStyle(), getBoundingClientRect: () => rect }
}

type FakePointerEvent = {
  readonly pointerId?: number
  readonly clientX?: number
  readonly clientY?: number
}

/** `.layout-resizer` の代役。手動で pointerdown/pointermove/pointerup を発火できる。 */
type FakeResizerElement = {
  readonly style: FakeStyle
  readonly addEventListener: (type: string, listener: (event: FakePointerEvent) => void) => void
  readonly removeEventListener: (type: string, listener: (event: FakePointerEvent) => void) => void
  readonly setPointerCapture: (pointerId: number | undefined) => void
  readonly trigger: (type: string, event: FakePointerEvent) => void
}

function makeFakeResizerElement(): FakeResizerElement {
  const listeners = new Map<string, Set<(event: FakePointerEvent) => void>>()
  return {
    style: makeFakeStyle(),
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    removeEventListener: (type, listener) => {
      listeners.get(type)?.delete(listener)
    },
    setPointerCapture: () => {},
    trigger: (type, event) => {
      for (const listener of listeners.get(type) ?? []) {
        listener(event)
      }
    },
  }
}

/** `#tsukumo-layout-reset` の代役。クリックを手動で発火できる。 */
type FakeLayoutButtonElement = {
  readonly style: FakeStyle
  readonly addEventListener: (type: string, listener: () => void) => void
  readonly trigger: (type: string) => void
}

function makeFakeLayoutButtonElement(): FakeLayoutButtonElement {
  const listeners = new Map<string, Set<() => void>>()
  return {
    style: makeFakeStyle(),
    addEventListener: (type, listener) => {
      const set = listeners.get(type) ?? new Set()
      set.add(listener)
      listeners.set(type, set)
    },
    trigger: (type) => {
      for (const listener of listeners.get(type) ?? []) {
        listener()
      }
    },
  }
}

type FakeLocalStorage = {
  readonly getItem: (key: string) => string | null
  readonly setItem: (key: string, value: string) => void
}

/**
 * まとめたレイアウトページの `<script>` を実際に動かす。仕切り・行・既定に戻すボタンの
 * 要素だけ本物の代役を渡し、それ以外（3領域の購読・送信フォーム）が参照する要素は
 * {@link runDispatchScript} と同じ考え方で無害な代役に任せる。
 */
function runLayoutScript(
  page: string,
  elements: {
    readonly grid: FakeLayoutContainer
    readonly rowTop: FakeLayoutContainer
    readonly rowBottom: FakeLayoutContainer
    readonly resizerRow: FakeResizerElement
    readonly resizerTop: FakeResizerElement
    readonly resizerBottom: FakeResizerElement
    readonly resetButton: FakeLayoutButtonElement
  },
  localStorageStub: FakeLocalStorage,
): void {
  const scriptMatch = /<script>([\s\S]*)<\/script>/.exec(page)
  if (scriptMatch === null || scriptMatch[1] === undefined) {
    throw new Error("ページに <script> が無い")
  }

  const ids = new Map<string, unknown>([
    ["tsukumo-layout-grid", elements.grid],
    ["tsukumo-layout-row-top", elements.rowTop],
    ["tsukumo-layout-row-bottom", elements.rowBottom],
    ["tsukumo-layout-resizer-row", elements.resizerRow],
    ["tsukumo-layout-resizer-top", elements.resizerTop],
    ["tsukumo-layout-resizer-bottom", elements.resizerBottom],
    ["tsukumo-layout-reset", elements.resetButton],
  ])

  const controller = makeFakeEventSourceController()
  const fallback = makeInertStub()
  const documentStub = {
    getElementById: (id: string) => ids.get(id) ?? makeInertStub(),
    scrollingElement: fallback,
    documentElement: fallback,
  }

  vm.runInNewContext(scriptMatch[1], {
    document: documentStub,
    EventSource: controller.EventSourceClass,
    MutationObserver: makeFakeMutationObserverController().MutationObserverClass,
    localStorage: localStorageStub,
  })
}

describe("送信先の一覧（claude が動いていそうな順に並べる。絞り込まない）", () => {
  it("likelyClaude が false の送信先も一覧に残り、選べる（判定を外しても閉じ込めない）", async () => {
    const targetSelect = makeFakeSelectElement()
    const status = makeFakeTextElement()
    const sendButton = makeFakeButtonElement()
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    await runDispatchScript(page, {
      targetSelect,
      status,
      sendButton,
      terminalsResponse: {
        ok: true,
        terminals: [
          { id: "t-likely", label: "claude worktree", likelyClaude: true },
          { id: "t-unsure", label: "たぶん違う", likelyClaude: false },
        ],
      },
    })

    expect(targetSelect.appendedOptions().map((option) => option.value)).toEqual([
      "t-likely",
      "t-unsure",
    ])
    expect(sendButton.disabled).toBe(false)
    expect(status.textContent).toBe("")
  })

  it("claude が動いていそうなものにだけ印を付け、ラベルそのものは変えない", async () => {
    const targetSelect = makeFakeSelectElement()
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    await runDispatchScript(page, {
      targetSelect,
      status: makeFakeTextElement(),
      sendButton: makeFakeButtonElement(),
      terminalsResponse: {
        ok: true,
        terminals: [
          { id: "t-likely", label: "claude worktree", likelyClaude: true },
          { id: "t-unsure", label: "たぶん違う", likelyClaude: false },
        ],
      },
    })

    const [likely, unsure] = targetSelect.appendedOptions()
    expect(likely?.textContent).toBe("★ claude worktree")
    expect(unsure?.textContent).toBe("たぶん違う")
  })

  it("一覧の取得に失敗しても落ちず、送信ボタンを無効のまま理由を表示する", async () => {
    const targetSelect = makeFakeSelectElement()
    const status = makeFakeTextElement()
    const sendButton = makeFakeButtonElement()
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    await runDispatchScript(page, {
      targetSelect,
      status,
      sendButton,
      terminalsResponse: { ok: false, reason: "orca コマンドが見つからない" },
    })

    expect(targetSelect.appendedOptions()).toEqual([])
    expect(sendButton.disabled).toBe(true)
    expect(status.textContent).toContain("orca コマンドが見つからない")
  })
})

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
    const bodies = {
      main: "<p>main1</p>",
      character: "<p>char1</p>",
      sidebar: "<p>side1</p>",
      question: "",
    }
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
      question: "",
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
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    for (const view of VIEW_NAMES) {
      expect(page).toContain(`new EventSource(${JSON.stringify(viewEventPath(view))})`)
      expect(page).toContain(`document.getElementById("tsukumo-view-${view}")`)
    }
  })

  it("右下の入力ペインに、送信先の選択と依頼を書くフォームを持つ", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    expect(page).toContain('<section class="layout-region layout-dispatch"')
    expect(page).toContain('<form id="tsukumo-dispatch-form">')
    expect(page).toContain('<select id="tsukumo-dispatch-target"')
    expect(page).toContain('<textarea id="tsukumo-dispatch-text"')
  })

  it("送信先の一覧の取得と依頼の送信を、経路の定数（TERMINALS_PATH / DISPATCH_PATH）宛に行う", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    expect(page).toContain(`fetch(${JSON.stringify(TERMINALS_PATH)})`)
    expect(page).toContain(`fetch(${JSON.stringify(DISPATCH_PATH)}`)
  })

  it("送信先が0件のとき・一覧の取得や送信に失敗したときに出す理由の文言を持つ", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    expect(page).toContain("動いているターミナルが無い")
    expect(page).toContain("送信先の一覧を取得できなかった")
    expect(page).toContain("送信できなかった")
  })

  it("送信ボタンは初期状態で無効になっている（送信先が揃うまで押せない）", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    expect(page).toContain(
      '<button type="submit" id="tsukumo-dispatch-send" class="dispatch-send" disabled>',
    )
  })
})

describe("まとめたレイアウトページの仕切り（3本のドラッグ・既定値・localStorage）", () => {
  it("3本の仕切りと、既定に戻すボタンを持つ", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    expect(page).toContain('id="tsukumo-layout-resizer-top"')
    expect(page).toContain('id="tsukumo-layout-resizer-bottom"')
    expect(page).toContain('id="tsukumo-layout-resizer-row"')
    expect(page).toContain(
      '<button type="button" id="tsukumo-layout-reset" class="layout-reset">既定の比率に戻す</button>',
    )
  })

  it("localStorage に何も保存されていないとき、既定の比率を適用する", () => {
    const grid = makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 1000 })
    const rowTop = makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 600 })
    const rowBottom = makeFakeLayoutContainer({ top: 600, left: 0, width: 1000, height: 400 })
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    runLayoutScript(
      page,
      {
        grid,
        rowTop,
        rowBottom,
        resizerRow: makeFakeResizerElement(),
        resizerTop: makeFakeResizerElement(),
        resizerBottom: makeFakeResizerElement(),
        resetButton: makeFakeLayoutButtonElement(),
      },
      { getItem: () => null, setItem: () => {} },
    )

    expect(grid.style.values()["--layout-row-top"]).toBe("60fr")
    expect(grid.style.values()["--layout-row-bottom"]).toBe("40fr")
    expect(rowTop.style.values()["--layout-top-left"]).toBe("75fr")
    expect(rowTop.style.values()["--layout-top-right"]).toBe("25fr")
    expect(rowBottom.style.values()["--layout-bottom-left"]).toBe("50fr")
    expect(rowBottom.style.values()["--layout-bottom-right"]).toBe("50fr")
  })

  it("localStorage の値が JSON として壊れていても、例外にならず既定の比率にフォールバックする", () => {
    const grid = makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 1000 })
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    expect(() =>
      runLayoutScript(
        page,
        {
          grid,
          rowTop: makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 600 }),
          rowBottom: makeFakeLayoutContainer({ top: 600, left: 0, width: 1000, height: 400 }),
          resizerRow: makeFakeResizerElement(),
          resizerTop: makeFakeResizerElement(),
          resizerBottom: makeFakeResizerElement(),
          resetButton: makeFakeLayoutButtonElement(),
        },
        { getItem: () => "{not valid json", setItem: () => {} },
      ),
    ).not.toThrow()

    expect(grid.style.values()["--layout-row-top"]).toBe("60fr")
  })

  it("localStorage の値が型違い・範囲外のときも、例外にならず既定の比率にフォールバックする", () => {
    const grid = makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 1000 })
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })
    const broken = JSON.stringify({ rowTop: 999, topLeft: "abc", bottomLeft: 35 })

    expect(() =>
      runLayoutScript(
        page,
        {
          grid,
          rowTop: makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 600 }),
          rowBottom: makeFakeLayoutContainer({ top: 600, left: 0, width: 1000, height: 400 }),
          resizerRow: makeFakeResizerElement(),
          resizerTop: makeFakeResizerElement(),
          resizerBottom: makeFakeResizerElement(),
          resetButton: makeFakeLayoutButtonElement(),
        },
        { getItem: () => broken, setItem: () => {} },
      ),
    ).not.toThrow()

    expect(grid.style.values()["--layout-row-top"]).toBe("60fr")
  })

  it("保存されていた正しい比率をそのまま復元する", () => {
    const grid = makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 1000 })
    const rowTop = makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 600 })
    const rowBottom = makeFakeLayoutContainer({ top: 600, left: 0, width: 1000, height: 400 })
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })
    const saved = JSON.stringify({ rowTop: 50, topLeft: 60, bottomLeft: 45 })

    runLayoutScript(
      page,
      {
        grid,
        rowTop,
        rowBottom,
        resizerRow: makeFakeResizerElement(),
        resizerTop: makeFakeResizerElement(),
        resizerBottom: makeFakeResizerElement(),
        resetButton: makeFakeLayoutButtonElement(),
      },
      { getItem: () => saved, setItem: () => {} },
    )

    expect(grid.style.values()["--layout-row-top"]).toBe("50fr")
    expect(rowTop.style.values()["--layout-top-left"]).toBe("60fr")
    expect(rowBottom.style.values()["--layout-bottom-left"]).toBe("45fr")
  })

  it("横の仕切りをドラッグすると上段/下段の高さの比率が変わり、離した時点で保存する", () => {
    const grid = makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 1000 })
    const resizerRow = makeFakeResizerElement()
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })
    let savedValue: string | undefined

    runLayoutScript(
      page,
      {
        grid,
        rowTop: makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 600 }),
        rowBottom: makeFakeLayoutContainer({ top: 600, left: 0, width: 1000, height: 400 }),
        resizerRow,
        resizerTop: makeFakeResizerElement(),
        resizerBottom: makeFakeResizerElement(),
        resetButton: makeFakeLayoutButtonElement(),
      },
      {
        getItem: () => null,
        setItem: (_key, value) => {
          savedValue = value
        },
      },
    )

    resizerRow.trigger("pointerdown", { pointerId: 1 })
    resizerRow.trigger("pointermove", { clientY: 500 })
    resizerRow.trigger("pointerup", {})

    expect(grid.style.values()["--layout-row-top"]).toBe("50fr")
    expect(grid.style.values()["--layout-row-bottom"]).toBe("50fr")
    expect(savedValue).toBeDefined()
    expect(JSON.parse(savedValue ?? "{}")).toEqual({ rowTop: 50, topLeft: 75, bottomLeft: 50 })
  })

  it("縦の仕切り（上段）をドラッグすると、メインとサイドバーの幅の比率が変わる", () => {
    const rowTop = makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 600 })
    const resizerTop = makeFakeResizerElement()
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    runLayoutScript(
      page,
      {
        grid: makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 1000 }),
        rowTop,
        rowBottom: makeFakeLayoutContainer({ top: 600, left: 0, width: 1000, height: 400 }),
        resizerRow: makeFakeResizerElement(),
        resizerTop,
        resizerBottom: makeFakeResizerElement(),
        resetButton: makeFakeLayoutButtonElement(),
      },
      { getItem: () => null, setItem: () => {} },
    )

    resizerTop.trigger("pointerdown", { pointerId: 1 })
    resizerTop.trigger("pointermove", { clientX: 300 })
    resizerTop.trigger("pointerup", {})

    expect(rowTop.style.values()["--layout-top-left"]).toBe("30fr")
    expect(rowTop.style.values()["--layout-top-right"]).toBe("70fr")
  })

  it("動かせる範囲は端まで詰めきらないようにクランプする（15%〜85%）", () => {
    const grid = makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 1000 })
    const resizerRow = makeFakeResizerElement()
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })

    runLayoutScript(
      page,
      {
        grid,
        rowTop: makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 600 }),
        rowBottom: makeFakeLayoutContainer({ top: 600, left: 0, width: 1000, height: 400 }),
        resizerRow,
        resizerTop: makeFakeResizerElement(),
        resizerBottom: makeFakeResizerElement(),
        resetButton: makeFakeLayoutButtonElement(),
      },
      { getItem: () => null, setItem: () => {} },
    )

    resizerRow.trigger("pointerdown", { pointerId: 1 })
    resizerRow.trigger("pointermove", { clientY: -1000 })
    resizerRow.trigger("pointerup", {})

    expect(grid.style.values()["--layout-row-top"]).toBe("15fr")
  })

  it("既定に戻すボタンを押すと、動かした比率が既定へ戻り保存される", () => {
    const grid = makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 1000 })
    const resizerRow = makeFakeResizerElement()
    const resetButton = makeFakeLayoutButtonElement()
    const page = buildLayoutPage({ main: "", character: "", sidebar: "", question: "" })
    let savedValue: string | undefined

    runLayoutScript(
      page,
      {
        grid,
        rowTop: makeFakeLayoutContainer({ top: 0, left: 0, width: 1000, height: 600 }),
        rowBottom: makeFakeLayoutContainer({ top: 600, left: 0, width: 1000, height: 400 }),
        resizerRow,
        resizerTop: makeFakeResizerElement(),
        resizerBottom: makeFakeResizerElement(),
        resetButton,
      },
      {
        getItem: () => null,
        setItem: (_key, value) => {
          savedValue = value
        },
      },
    )

    resizerRow.trigger("pointerdown", { pointerId: 1 })
    resizerRow.trigger("pointermove", { clientY: 900 })
    resizerRow.trigger("pointerup", {})
    expect(grid.style.values()["--layout-row-top"]).not.toBe("60fr")

    resetButton.trigger("click")

    expect(grid.style.values()["--layout-row-top"]).toBe("60fr")
    expect(grid.style.values()["--layout-row-bottom"]).toBe("40fr")
    expect(JSON.parse(savedValue ?? "{}")).toEqual({ rowTop: 60, topLeft: 75, bottomLeft: 50 })
  })
})

// --- メインビューのタブ制御（mainTurnsScript）を実際に動かすための道具 -----------------------
//
// タブの選択と「新しいやり取りが始まったら先頭へ戻す」は**ブラウザ側だけが持つ状態**なので、
// サーバの出力を見るだけでは確かめられない。ここでは本文の差し替え（push）を
// `MutationObserver` の発火で再現し、選択が保たれるかどうかを確かめる。

type FakeTurnsHandle = {
  readonly setTurns: (ids: readonly string[]) => void
  readonly clickTab: (id: string) => void
  readonly activeTabId: () => string | undefined
  readonly visiblePanelIds: () => readonly string[]
  readonly scrollTop: () => number
  readonly setScrollTop: (value: number) => void
  readonly pushUpdate: () => void
}

function runMainTurnsScript(page: string, initialTurnIds: readonly string[]): FakeTurnsHandle {
  const scriptMatch = /<script>([\s\S]*)<\/script>/.exec(page)
  if (scriptMatch === null || scriptMatch[1] === undefined) {
    throw new Error("ページに <script> が無い")
  }

  type FakeTab = {
    readonly dataset: { readonly turnId: string }
    readonly classList: { readonly toggle: (name: string, force: boolean) => void }
    active: boolean
  }
  type FakePanel = { readonly dataset: { readonly turnId: string }; hidden: boolean }

  let tabs: FakeTab[] = []
  let panels: FakePanel[] = []
  let scrollTop = 0
  let clickListener: ((event: { readonly target: unknown }) => void) | undefined = undefined

  const setTurns = (ids: readonly string[]) => {
    tabs = ids.map((id) => {
      const tab: FakeTab = {
        dataset: { turnId: id },
        classList: {
          toggle: (_name: string, force: boolean) => {
            tab.active = force
          },
        },
        active: false,
      }
      return tab
    })
    panels = ids.map((id) => ({ dataset: { turnId: id }, hidden: true }))
  }
  setTurns(initialTurnIds)

  const element = {
    innerHTML: "",
    get scrollTop(): number {
      return scrollTop
    },
    set scrollTop(value: number) {
      scrollTop = value
    },
    scrollHeight: 500,
    clientHeight: 100,
    addEventListener: (type: string, listener: (event: { readonly target: unknown }) => void) => {
      if (type === "click") {
        clickListener = listener
      }
    },
    querySelector: (selector: string) =>
      selector === ".main-turns" ? { dataset: { turnCount: String(tabs.length) } } : null,
    querySelectorAll: (selector: string) => (selector === ".turn-tab" ? tabs : panels),
  }

  const observer = makeFakeMutationObserverController()
  const controller = makeFakeEventSourceController()
  vm.runInNewContext(scriptMatch[1], {
    document: {
      getElementById: () => element,
      scrollingElement: element,
      documentElement: element,
    },
    EventSource: controller.EventSourceClass,
    MutationObserver: observer.MutationObserverClass,
  })

  return {
    setTurns,
    clickTab: (id) => {
      const tab = tabs.find((candidate) => candidate.dataset.turnId === id)
      clickListener?.({
        target: { closest: (selector: string) => (selector === ".turn-tab" ? tab : null) },
      })
    },
    activeTabId: () => tabs.find((tab) => tab.active)?.dataset.turnId,
    visiblePanelIds: () =>
      panels.filter((panel) => !panel.hidden).map((panel) => panel.dataset.turnId),
    scrollTop: () => scrollTop,
    setScrollTop: (value) => {
      scrollTop = value
    },
    pushUpdate: () => {
      observer.trigger()
    },
  }
}

describe("メインビューのタブの選択（push で戻らない・新しいやり取りで先頭へ）", () => {
  const pageWithTurns = () => buildViewPage("main", buildMainBody([]))

  it("最初は今回（左端）のやり取りが選ばれている", () => {
    const handle = runMainTurnsScript(pageWithTurns(), ["3", "2", "1"])
    handle.pushUpdate()

    expect(handle.activeTabId()).toBe("3")
    expect(handle.visiblePanelIds()).toEqual(["3"])
  })

  it("過去のタブを選ぶとそのやり取りだけが見え、先頭から読める位置に戻る", () => {
    const handle = runMainTurnsScript(pageWithTurns(), ["3", "2", "1"])
    handle.pushUpdate()
    handle.setScrollTop(400)

    handle.clickTab("1")

    expect(handle.visiblePanelIds()).toEqual(["1"])
    expect(handle.scrollTop()).toBe(0)
  })

  it("本文が差し替わっても、選んでいた過去のタブが選ばれたまま残る", () => {
    const handle = runMainTurnsScript(pageWithTurns(), ["3", "2", "1"])
    handle.pushUpdate()
    handle.clickTab("2")

    // 今回のやり取りに記録が増えただけの push（やり取りの数は変わらない）。
    handle.pushUpdate()

    expect(handle.activeTabId()).toBe("2")
    expect(handle.visiblePanelIds()).toEqual(["2"])
  })

  it("新しいやり取りが始まると、今回を見ていた人は新しい先頭へ移る", () => {
    const handle = runMainTurnsScript(pageWithTurns(), ["3", "2", "1"])
    handle.pushUpdate()
    handle.setScrollTop(400)

    handle.setTurns(["4", "3", "2", "1"])
    handle.pushUpdate()

    expect(handle.activeTabId()).toBe("4")
    expect(handle.scrollTop()).toBe(0)
  })

  it("過去のタブを見ている間は、新しいやり取りが始まっても動かさない", () => {
    const handle = runMainTurnsScript(pageWithTurns(), ["3", "2", "1"])
    handle.pushUpdate()
    handle.clickTab("1")
    handle.setScrollTop(400)

    handle.setTurns(["4", "3", "2", "1"])
    handle.pushUpdate()

    expect(handle.activeTabId()).toBe("1")
    expect(handle.scrollTop()).toBe(400)
  })
})

describe("キャラクターからの質問（入力欄の領域に差し込む）", () => {
  const pending = {
    toolUseId: "q1",
    questions: [
      {
        header: "出す場所",
        text: "質問をどのビューに出す？",
        multiSelect: false,
        options: [
          { label: "メインビュー", description: "作業の記録として出す" },
          { label: "吹き出し", description: "キャラビューに出す" },
        ],
      },
    ],
  }

  it("答え待ちが無いときは空を返す（入力フォームがそのまま見える）", () => {
    expect(buildQuestionBody(undefined)).toBe("")
  })

  it("質問文・見出し・選択肢を、番号付きの一覧で出す", () => {
    const body = buildQuestionBody(pending)

    expect(body).toContain("質問をどのビューに出す？")
    expect(body).toContain("出す場所")
    expect(body).toContain("メインビュー")
    expect(body).toContain("作業の記録として出す")
    // 番号はターミナルの並びと同じ。答えるのはターミナル側。
    expect(body).toContain("ターミナル側で答えてよい")
  })

  it("選択肢は押せて、押すと番号キーを押す（文字を流し込む経路では届かないため）", () => {
    const body = buildQuestionBody(pending)

    expect(body).toContain('<button type="button" class="question-choice" data-key="1"')
    expect(body).toContain('data-key="2"')
    expect(body).toContain("押すと番号キーを押す")
  })

  it("複数選べる質問はその旨を出す", () => {
    const body = buildQuestionBody({
      ...pending,
      questions: [{ ...pending.questions[0]!, multiSelect: true }],
    })

    expect(body).toContain("複数選べる")
  })

  it("質問文や選択肢に HTML が混ざっていてもエスケープする", () => {
    const body = buildQuestionBody({
      toolUseId: "q1",
      questions: [
        {
          header: "h",
          text: "<script>alert(1)</script>",
          multiSelect: false,
          options: [{ label: "<b>太字</b>", description: "" }],
        },
      ],
    })

    expect(body).not.toContain("<script>")
    expect(body).not.toContain("<b>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("メインビューには「聞いたこと・選んだ答え」が記録として残る", () => {
    const body = buildMainBody([
      {
        kind: "question",
        questions: pending.questions,
        answers: ["メインビュー"],
      },
    ])

    expect(body).toContain("質問をどのビューに出す？")
    expect(body).toContain("● メインビュー")
    expect(body).toContain("○ 吹き出し")
  })

  it("答えが分からない質問（差し戻しなど）は、印を付けずに選択肢だけ出す", () => {
    const body = buildMainBody([{ kind: "question", questions: pending.questions, answers: [] }])

    expect(body).toContain("○ メインビュー")
    expect(body).not.toContain("●")
  })

  it("レイアウトページは、入力欄の領域に質問の差し込み先を持つ", () => {
    const page = buildLayoutPage({
      main: "",
      character: "",
      sidebar: "",
      question: '<button class="question-choice" data-key="1">はい</button>',
    })

    expect(page).toContain('id="tsukumo-view-question"')
    expect(page).toContain('data-key="1"')
    // 質問の領域と送信フォームは同じ領域の中にある（差し替えるため）。
    const region = page.slice(page.indexOf('id="tsukumo-view-dispatch"'))
    expect(region.indexOf('id="tsukumo-view-question"')).toBeLessThan(
      region.indexOf('id="tsukumo-dispatch-form"'),
    )
  })
})

describe("レポートの図・グラフ・コードの色（同梱ライブラリを使う）", () => {
  it("```mermaid は図の入れ物になり、中身はエスケープされる", () => {
    const body = buildMainBody([
      { kind: "detail", markdown: "```mermaid\nflowchart LR\n  A --> B & <script>\n```" },
    ])

    expect(body).toContain('<pre class="mermaid">')
    expect(body).toContain("flowchart LR")
    expect(body).not.toContain("<script>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("```chart はグラフの入れ物になり、設定は属性に入る", () => {
    const body = buildMainBody([
      { kind: "detail", markdown: '```chart\n{"type":"bar","data":{}}\n```' },
    ])

    expect(body).toContain('<div class="chart-block">')
    expect(body).toContain("<canvas data-chart=")
    expect(body).toContain("&quot;type&quot;:&quot;bar&quot;")
  })

  it("ふつうのコードブロックは language クラス付きで出る（highlight.js が拾う）", () => {
    const body = buildMainBody([{ kind: "detail", markdown: "```ts\nconst a = 1\n```" }])

    expect(body).toContain('<pre><code class="language-ts">')
    expect(body).toContain("const a = 1")
  })

  it("ページは同梱したライブラリを 127.0.0.1 から読む（外部 URL を書かない）", () => {
    const page = buildViewPage("main", buildMainBody([]))

    expect(page).toContain('href="/vendor/highlight-theme.min.css"')
    expect(page).toContain('src="/vendor/highlight.min.js"')
    expect(page).toContain("/vendor/mermaid.min.js")
    expect(page).toContain("/vendor/chart.umd.min.js")
    expect(page).not.toContain("https://cdn")
    expect(page).not.toContain("http://cdn")
  })
})

describe("メインビューのやり取り（依頼で区切り、タブで遡る）", () => {
  const request = (text: string): MainViewEntry => ({ kind: "request", text })
  const detail = (markdown: string): MainViewEntry => ({ kind: "detail", markdown })
  const edit = (path: string): MainViewEntry => ({
    kind: "tool",
    name: "Edit",
    input: { file_path: path },
    result: { content: "ok", isError: false },
  })

  it("依頼を境目にやり取りへ分け、今回だけを開いて出す（過去は hidden）", () => {
    const body = buildMainBody([
      request("前の依頼"),
      detail("前のレポート"),
      request("今回の依頼"),
      detail("今回のレポート"),
    ])

    // 今回のパネルが先（hidden が付かない）、過去のパネルは hidden。
    const currentPanel = /<section class="turn-panel" data-turn-id="1">/.exec(body)
    const pastPanel = /<section class="turn-panel" data-turn-id="0" hidden>/.exec(body)
    expect(currentPanel).not.toBeNull()
    expect(pastPanel).not.toBeNull()
    // 依頼の本文は見出しとして出る。
    expect(body).toContain("今回の依頼")
    expect(body).toContain("前の依頼")
  })

  it("タブは新しいものが左で、今回・1つ前…と並ぶ", () => {
    const body = buildMainBody([
      request("3つ前"),
      detail("a"),
      request("2つ前"),
      detail("b"),
      request("1つ前"),
      detail("c"),
      request("今"),
      detail("d"),
    ])

    const labels = [...body.matchAll(/class="turn-tab[^"]*"[^>]*>([^<]+)</g)].map(
      (matched) => matched[1],
    )
    // 4つ前は窓から外れる（上限3やり取り）。
    expect(labels).toEqual(["今回", "1つ前", "2つ前"])
  })

  it("やり取りが1つだけのときはタブを出さない", () => {
    const body = buildMainBody([request("ひとつだけ"), detail("レポート")])

    expect(body).not.toContain("turn-tab")
    expect(body).toContain("ひとつだけ")
  })

  it("古いやり取りは新しい方から3つだけ残す（今回・1つ前・2つ前）", () => {
    const entries = Array.from({ length: 8 }, (_, index) => [
      request(`依頼${String(index)}`),
      detail(`レポート${String(index)}`),
    ]).flat()

    const body = buildMainBody(entries)

    expect(body.split('<section class="turn-panel"').length - 1).toBe(3)
    expect(body).toContain("依頼7")
    expect(body).toContain("依頼5")
    expect(body).not.toContain("依頼4")
  })

  it("レポートと、その後に続くツールの実行が1つのステップにまとまる", () => {
    const body = buildMainBody([
      request("依頼"),
      detail("まず読むね"),
      edit("src/a.ts"),
      detail("次に直すね"),
      edit("src/b.ts"),
    ])

    const steps = body.split('<section class="main-step">').slice(1)
    expect(steps).toHaveLength(2)
    expect(steps[0]).toContain("まず読むね")
    expect(steps[0]).toContain("Edit: src/a.ts")
    expect(steps[0]).not.toContain("src/b.ts")
    expect(steps[1]).toContain("次に直すね")
    expect(steps[1]).toContain("Edit: src/b.ts")
    // 番号の見出しは振らない（ユーザーの指摘 2026-09-10）。
    expect(body).not.toContain("ステップ1")
  })

  it("ステップは縦に1本で積む（横に並べない）", () => {
    const body = buildMainBody([request("依頼"), detail("ひとつめ"), detail("ふたつめ")])

    expect(body).toContain('class="main-steps"')
    expect(body).not.toContain("grid-template-columns")
  })

  it("レポートより前に実行されたツールも、レポートを持たないステップとして出る", () => {
    const body = buildMainBody([request("依頼"), edit("src/first.ts"), detail("あとから説明")])

    const steps = body.split('<section class="main-step">').slice(1)
    expect(steps).toHaveLength(2)
    expect(steps[0]).toContain("Edit: src/first.ts")
    expect(steps[1]).toContain("あとから説明")
  })

  it("1つのやり取りの記録が上限を超えたら、古いほうから落として件数を出す", () => {
    const entries = [
      request("依頼"),
      ...Array.from({ length: 45 }, (_, index) => detail(`レポート${String(index)}`)),
    ]

    const body = buildMainBody(entries)

    expect(body).toContain("これ以前の")
    expect(body).toContain("件は省略した")
    expect(body).toContain("レポート44")
    expect(body).not.toContain("レポート0<")
  })

  it("依頼の見出しは1行に収め、長すぎるものは切り詰める", () => {
    const body = buildMainBody([request(`${"あ".repeat(200)}\n2行目`), detail("x")])

    expect(body).toContain("…")
    expect(body).not.toContain("2行目")
    expect(body).not.toContain("あ".repeat(200))
  })

  it("最初の依頼より前の記録も落とさずに出す（途中から追い始めたとき）", () => {
    const body = buildMainBody([detail("依頼より前のレポート"), request("依頼"), detail("今回")])

    expect(body).toContain("依頼より前のレポート")
    expect(body.split('<section class="turn-panel"').length - 1).toBe(2)
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

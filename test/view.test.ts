import { describe, expect, it } from "bun:test"
import vm from "node:vm"

import { type MainViewEntry } from "../src/transcript.ts"
import {
  buildCharacterBody,
  buildIndexPage,
  buildLayoutPage,
  buildMainBody,
  buildPendingAnswerBody,
  buildSidebarBody,
  buildViewPage,
  type CharacterViewData,
  COMMANDS_PATH,
  DISPATCH_PATH,
  INTERRUPT_PATH,
  isViewName,
  LAYOUT_PATH,
  PENDING_ANSWER_EVENT_PATH,
  PROMPT_PATH,
  type SidebarData,
  type SidebarToolActivity,
  summarizeToolInput,
  TERMINALS_PATH,
  TURN_STATUS_EVENT_PATH,
  TURN_STATUS_IDLE,
  TURN_STATUS_IN_PROGRESS,
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

// 実行中1件・完了2件（うち1件はサブエージェントの中）の、手で書いた架空のデータ。
const RUNNING_ACTIVITY: SidebarToolActivity = {
  name: "Bash",
  input: { command: "echo dummy" },
  nested: false,
}
const FINISHED_ACTIVITY: SidebarToolActivity = {
  name: "Edit",
  input: { file_path: "src/dummy.ts" },
  nested: false,
}
const NESTED_FINISHED_ACTIVITY: SidebarToolActivity = {
  name: "Read",
  input: { file_path: "src/dummy2.ts" },
  nested: true,
}

// buildSidebarBody に渡す全部入りのデータ。個々のテストは必要な部分だけ上書きする。
const FULL_SIDEBAR_DATA: SidebarData = {
  activity: {
    running: [RUNNING_ACTIVITY],
    finished: [FINISHED_ACTIVITY, NESTED_FINISHED_ACTIVITY],
  },
  tasks: [
    { id: "X-001", summary: "架空のサイドバー実装", status: "done" },
    { id: "X-002", summary: "架空のタスク一覧", status: "todo" },
  ],
  session: { model: "claude-sonnet-5", permissionMode: "auto", turnStartedAt: 1_700_000_000_000 },
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

// --- 入力欄（dispatchScript）を実際に動かして確かめるための道具 -------------------------------
//
// 送り先の選択は無くなった（送り先はセッション駆動1つに決まっている）。ここで実際に動かして
// 確かめるのは、Enter/Shift+Enter・IME変換確定・送信成功/失敗時の入力欄の扱い・進行中の状態
// （`TURN_STATUS_EVENT_PATH`）による送信ボタンの表示切り替えと、押した先が `PROMPT_PATH` /
// `INTERRUPT_PATH` になっていること。実際に見えるかはブラウザでの目視確認に任せる
// （docs/coding-standards.md「描画は自動テストで守らない」）。

/** `<span id="tsukumo-dispatch-status">` の代役。 */
type FakeTextElement = { textContent: string }

function makeFakeTextElement(): FakeTextElement {
  return { textContent: "" }
}

/** `<button id="tsukumo-dispatch-send">` の代役。クリックを手動で発火できる。 */
type FakeButtonElement = {
  disabled: boolean
  textContent: string
  readonly addEventListener: (type: string, listener: (event: FakePreventableEvent) => void) => void
  readonly click: () => void
}

type FakePreventableEvent = { readonly preventDefault: () => void }

function makeFakeButtonElement(): FakeButtonElement {
  const listeners = new Set<(event: FakePreventableEvent) => void>()
  let disabled = false
  let textContent = ""
  return {
    get disabled() {
      return disabled
    },
    set disabled(value) {
      disabled = value
    },
    get textContent() {
      return textContent
    },
    set textContent(value) {
      textContent = value
    },
    addEventListener: (type, listener) => {
      if (type === "click") {
        listeners.add(listener)
      }
    },
    click: () => {
      const event: FakePreventableEvent = { preventDefault: () => {} }
      for (const listener of listeners) {
        listener(event)
      }
    },
  }
}

/** `<form id="tsukumo-dispatch-form">` の代役。`requestSubmit()` で submit を手動発火できる。 */
type FakeFormElement = {
  readonly addEventListener: (type: string, listener: (event: FakePreventableEvent) => void) => void
  readonly requestSubmit: () => void
}

function makeFakeFormElement(): FakeFormElement {
  const listeners = new Set<(event: FakePreventableEvent) => void>()
  return {
    addEventListener: (type, listener) => {
      if (type === "submit") {
        listeners.add(listener)
      }
    },
    requestSubmit: () => {
      const event: FakePreventableEvent = { preventDefault: () => {} }
      for (const listener of listeners) {
        listener(event)
      }
    },
  }
}

/** `keydown` イベントの代役。IME の変換確定は `isComposing` / `keyCode` の両方で表現できる。 */
type FakeKeydownEvent = FakePreventableEvent & {
  readonly key: string
  readonly shiftKey: boolean
  readonly isComposing: boolean
  readonly keyCode: number
}

function makeFakeKeydownEvent(options: {
  readonly key: string
  readonly shiftKey?: boolean
  readonly isComposing?: boolean
  readonly keyCode?: number
}): { readonly event: FakeKeydownEvent; readonly wasPrevented: () => boolean } {
  let prevented = false
  return {
    event: {
      key: options.key,
      shiftKey: options.shiftKey ?? false,
      isComposing: options.isComposing ?? false,
      keyCode: options.keyCode ?? 0,
      preventDefault: () => {
        prevented = true
      },
    },
    wasPrevented: () => prevented,
  }
}

/** `input` イベントの代役。IME 変換中は `isComposing` が true になる。 */
type FakeInputEvent = { readonly isComposing: boolean }

/**
 * `<textarea id="tsukumo-dispatch-text">` の代役。`keydown` に加えて、`/` 補完が拾う `input` も
 * 手動で発火できる。
 */
type FakeTextAreaElement = {
  value: string
  readonly addEventListener: (
    type: string,
    listener: (event: FakeKeydownEvent | FakeInputEvent) => void,
  ) => void
  readonly focus: () => void
  readonly dispatchKeydown: (event: FakeKeydownEvent) => void
  readonly dispatchInput: (event?: FakeInputEvent) => void
  readonly focusCount: () => number
}

function makeFakeTextAreaElement(initialValue: string): FakeTextAreaElement {
  const keydownListeners = new Set<(event: FakeKeydownEvent) => void>()
  const inputListeners = new Set<(event: FakeInputEvent) => void>()
  let value = initialValue
  let focusCount = 0
  return {
    get value() {
      return value
    },
    set value(next) {
      value = next
    },
    addEventListener: (type, listener) => {
      if (type === "keydown") {
        keydownListeners.add(listener as (event: FakeKeydownEvent) => void)
      }
      if (type === "input") {
        inputListeners.add(listener as (event: FakeInputEvent) => void)
      }
    },
    focus: () => {
      focusCount += 1
    },
    dispatchKeydown: (event) => {
      for (const listener of keydownListeners) {
        listener(event)
      }
    },
    dispatchInput: (event = { isComposing: false }) => {
      for (const listener of inputListeners) {
        listener(event)
      }
    },
    focusCount: () => focusCount,
  }
}

type FakeFetchCall = { readonly url: string; readonly body: string | undefined }

/**
 * `fetch` の代役。`responses` に無い URL には `{ ok: true }` を返す。呼び出しは
 * すべて記録するので、送り先（`PROMPT_PATH` か `INTERRUPT_PATH` か）と本文を確かめられる。
 */
function makeFakeFetch(responses: ReadonlyMap<string, unknown>): {
  readonly fetchStub: (
    url: string,
    init?: { readonly method?: string; readonly body?: string },
  ) => Promise<{ readonly json: () => Promise<unknown> }>
  readonly calls: () => readonly FakeFetchCall[]
} {
  const calls: FakeFetchCall[] = []
  return {
    fetchStub: (url, init) => {
      calls.push({ url, body: init?.body })
      const response = responses.get(url) ?? { ok: true }
      return Promise.resolve({ json: () => Promise.resolve(response) })
    },
    calls: () => calls,
  }
}

/**
 * まとめたレイアウトページの `<script>`（3領域ぶんの購読と入力欄の配線が同居する）を実際に
 * 動かす。3領域の購読が参照する要素は無害な代役で埋める（{@link runSubscriptionScript} と
 * 同じ考え方）。`dispatchTurnStatus` で `TURN_STATUS_EVENT_PATH` 宛の update を手動で起こせる。
 */
/**
 * 答え待ちの箱の置き場所（`#tsukumo-dispatch-pending`）の代役。`innerHTML` を読み返せる
 * ことに加え、`pendingAnswerScript` が無条件に呼ぶ `addEventListener` / `querySelector` /
 * `querySelectorAll` を持たせる必要があるので `makeInertStub` をそのまま使う。
 */
type FakePendingBoxElement = InertStub

/** 入力欄の領域（`#tsukumo-view-dispatch`）の代役。`data-pending` 属性を読み返せる。 */
type FakePendingRegionElement = { dataset: { pending: string } }

/**
 * `<li>` の `mousedown` の代役。`closest` は selector を見ずに常に「押した項目」を返す
 * （実装が `.dispatch-suggestion-item` にしか listener を付けないため、テストでは
 * どの要素にヒットしたかまで作り込む必要が無い）。
 */
type FakeMousedownEvent = FakePreventableEvent & {
  readonly target: {
    readonly closest: (selector: string) => { readonly dataset: { readonly index: string } } | null
  }
}

/**
 * `/` 補完の候補一覧（`#tsukumo-dispatch-suggestions`）の代役。`hidden` と `innerHTML` を
 * 読み返せる。`moveSuggestionSelection` が呼ぶ `querySelectorAll` は空を返すだけでよい
 * （上下キーでの選択そのものは目視確認に任せる。docs/coding-standards.md「描画は自動テストで
 * 守らない」）。`clickItem` は「index 番目の候補を mousedown で押した」を模す。
 */
type FakeSuggestionsBoxElement = {
  hidden: boolean
  innerHTML: string
  readonly querySelectorAll: () => readonly never[]
  readonly addEventListener: (type: string, listener: (event: FakeMousedownEvent) => void) => void
  readonly clickItem: (index: number) => { readonly wasPrevented: () => boolean }
}

function makeFakeSuggestionsBoxElement(): FakeSuggestionsBoxElement {
  let hidden = true
  let html = ""
  const mousedownListeners = new Set<(event: FakeMousedownEvent) => void>()
  return {
    get hidden() {
      return hidden
    },
    set hidden(value) {
      hidden = value
    },
    get innerHTML() {
      return html
    },
    set innerHTML(value) {
      html = value
    },
    querySelectorAll: () => [],
    addEventListener: (type, listener) => {
      if (type === "mousedown") {
        mousedownListeners.add(listener)
      }
    },
    clickItem: (index) => {
      let prevented = false
      const event: FakeMousedownEvent = {
        target: { closest: () => ({ dataset: { index: String(index) } }) },
        preventDefault: () => {
          prevented = true
        },
      }
      for (const listener of mousedownListeners) {
        listener(event)
      }
      return { wasPrevented: () => prevented }
    },
  }
}

function runInputScript(
  page: string,
  elements: {
    readonly form: FakeFormElement
    readonly textArea: FakeTextAreaElement
    readonly sendButton: FakeButtonElement
    readonly status: FakeTextElement
  },
  fetchStub: (
    url: string,
    init?: { readonly method?: string; readonly body?: string },
  ) => Promise<{ readonly json: () => Promise<unknown> }>,
  initialTitle = "tsukumo",
): {
  readonly dispatchTurnStatus: (data: string) => void
  readonly dispatchPendingAnswer: (html: string) => void
  readonly pendingBox: FakePendingBoxElement
  readonly pendingDataAttribute: () => string
  readonly title: () => string
  readonly suggestionsBox: FakeSuggestionsBoxElement
} {
  const scriptMatch = /<script>([\s\S]*)<\/script>/.exec(page)
  if (scriptMatch === null || scriptMatch[1] === undefined) {
    throw new Error("ページに <script> が無い")
  }

  const pendingBox: FakePendingBoxElement = makeInertStub()
  const pendingRegion: FakePendingRegionElement = { dataset: { pending: "no" } }
  const suggestionsBox = makeFakeSuggestionsBoxElement()

  const ids = new Map<string, unknown>([
    ["tsukumo-dispatch-form", elements.form],
    ["tsukumo-dispatch-text", elements.textArea],
    ["tsukumo-dispatch-send", elements.sendButton],
    ["tsukumo-dispatch-status", elements.status],
    ["tsukumo-dispatch-pending", pendingBox],
    ["tsukumo-view-dispatch", pendingRegion],
    ["tsukumo-dispatch-suggestions", suggestionsBox],
  ])
  const controller = makeFakeEventSourceController()
  const fallback = makeInertStub()

  const documentStub = {
    getElementById: (id: string) => ids.get(id) ?? makeInertStub(),
    scrollingElement: fallback,
    documentElement: fallback,
    title: initialTitle,
  }

  vm.runInNewContext(scriptMatch[1], {
    document: documentStub,
    EventSource: controller.EventSourceClass,
    MutationObserver: makeFakeMutationObserverController().MutationObserverClass,
    fetch: fetchStub,
    localStorage: { getItem: () => null, setItem: () => {} },
  })

  return {
    dispatchTurnStatus: (data) => {
      controller.dispatch(TURN_STATUS_EVENT_PATH, data)
    },
    dispatchPendingAnswer: (html) => {
      controller.dispatch(PENDING_ANSWER_EVENT_PATH, html)
    },
    pendingBox,
    pendingDataAttribute: () => pendingRegion.dataset.pending,
    title: () => documentStub.title,
    suggestionsBox,
  }
}

/** 待っている非同期処理（fetch → response.json() の await）を1回分進める。 */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
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
 * 要素だけ本物の代役を渡し、それ以外（3領域の購読・入力欄）が参照する要素は
 * {@link runInputScript} と同じ考え方で無害な代役に任せる。
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

describe("入力欄（送信・中断）", () => {
  function setUp(responses: ReadonlyMap<string, unknown> = new Map()): {
    readonly form: FakeFormElement
    readonly textArea: FakeTextAreaElement
    readonly sendButton: FakeButtonElement
    readonly status: FakeTextElement
    readonly calls: () => readonly FakeFetchCall[]
    readonly dispatchTurnStatus: (data: string) => void
    readonly dispatchPendingAnswer: (html: string) => void
    readonly pendingBox: FakePendingBoxElement
    readonly pendingDataAttribute: () => string
    readonly title: () => string
    readonly suggestionsBox: FakeSuggestionsBoxElement
  } {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })
    const form = makeFakeFormElement()
    const textArea = makeFakeTextAreaElement("")
    const sendButton = makeFakeButtonElement()
    const status = makeFakeTextElement()
    const { fetchStub, calls } = makeFakeFetch(responses)

    const {
      dispatchTurnStatus,
      dispatchPendingAnswer,
      pendingBox,
      pendingDataAttribute,
      title,
      suggestionsBox,
    } = runInputScript(page, { form, textArea, sendButton, status }, fetchStub)

    return {
      form,
      textArea,
      sendButton,
      status,
      calls,
      dispatchTurnStatus,
      dispatchPendingAnswer,
      pendingBox,
      pendingDataAttribute,
      title,
      suggestionsBox,
    }
  }

  it("Enter で送信する", async () => {
    const { textArea, calls } = setUp()
    textArea.value = "テストの依頼"

    const { event } = makeFakeKeydownEvent({ key: "Enter" })
    textArea.dispatchKeydown(event)
    await flushMicrotasks()

    expect(calls()).toEqual([{ url: PROMPT_PATH, body: JSON.stringify({ text: "テストの依頼" }) }])
  })

  it("Shift+Enter では送信せず、改行をそのまま許す（preventDefault しない）", () => {
    const { textArea, calls } = setUp()

    const { event, wasPrevented } = makeFakeKeydownEvent({ key: "Enter", shiftKey: true })
    textArea.dispatchKeydown(event)

    expect(wasPrevented()).toBe(false)
    expect(calls()).toEqual([])
  })

  it("IME の変換確定の Enter では送信しない（isComposing / keyCode 229 のどちらでも）", () => {
    const composing = setUp()
    const { event: composingEvent, wasPrevented: composingPrevented } = makeFakeKeydownEvent({
      key: "Enter",
      isComposing: true,
    })
    composing.textArea.dispatchKeydown(composingEvent)
    expect(composingPrevented()).toBe(false)
    expect(composing.calls()).toEqual([])

    const legacyIme = setUp()
    const { event: legacyEvent, wasPrevented: legacyPrevented } = makeFakeKeydownEvent({
      key: "Enter",
      keyCode: 229,
    })
    legacyIme.textArea.dispatchKeydown(legacyEvent)
    expect(legacyPrevented()).toBe(false)
    expect(legacyIme.calls()).toEqual([])
  })

  it("送信に成功したら入力欄を空にしてフォーカスを残す", async () => {
    const { form, textArea, status } = setUp()
    textArea.value = "テストの依頼"

    form.requestSubmit()
    await flushMicrotasks()

    expect(textArea.value).toBe("")
    expect(textArea.focusCount()).toBeGreaterThan(0)
    expect(status.textContent).toBe("送信済み")
  })

  it("送信に失敗したら入力欄の文字列を消さない", async () => {
    const { form, textArea, status } = setUp(
      new Map([[PROMPT_PATH, { ok: false, reason: "セッションがまだ起きていない" }]]),
    )
    textArea.value = "テストの依頼"

    form.requestSubmit()
    await flushMicrotasks()

    expect(textArea.value).toBe("テストの依頼")
    expect(status.textContent).toContain("セッションがまだ起きていない")
  })

  it("進行中は送信ボタンが「中断」に変わる。押した瞬間ではなく、サーバから届いた状態で決まる", () => {
    const { sendButton, dispatchTurnStatus } = setUp()

    expect(sendButton.textContent).toBe("送信")
    dispatchTurnStatus(TURN_STATUS_IN_PROGRESS)
    expect(sendButton.textContent).toBe("中断")
    dispatchTurnStatus(TURN_STATUS_IDLE)
    expect(sendButton.textContent).toBe("送信")
  })

  it("進行中に送信ボタンを押すと、INTERRUPT_PATH を叩くだけ", async () => {
    const { sendButton, status, calls, dispatchTurnStatus } = setUp()
    dispatchTurnStatus(TURN_STATUS_IN_PROGRESS)

    sendButton.click()
    await flushMicrotasks()

    expect(calls()).toEqual([{ url: INTERRUPT_PATH, body: undefined }])
    expect(status.textContent).toBe("中断した")
  })

  describe("入力欄の上の答え待ちの箱（PENDING_ANSWER_EVENT_PATH を購読して差し替える）", () => {
    it("答え待ちが届くと箱の中身を差し替え、領域の data-pending を yes にし、タブのタイトルに「● 」を付ける", () => {
      const { pendingBox, pendingDataAttribute, title, dispatchPendingAnswer } = setUp()

      expect(pendingDataAttribute()).toBe("no")
      expect(title()).toBe("tsukumo")

      dispatchPendingAnswer('<div class="pending-answer pending-permission"></div>')

      expect(pendingBox.innerHTML).toBe('<div class="pending-answer pending-permission"></div>')
      expect(pendingDataAttribute()).toBe("yes")
      expect(title()).toBe("● tsukumo")
    })

    it("答え待ちが消えたら（空文字）箱を空にし、data-pending を no に、タイトルを元へ戻す", () => {
      const { pendingBox, pendingDataAttribute, title, dispatchPendingAnswer } = setUp()

      dispatchPendingAnswer('<div class="pending-answer pending-question"></div>')
      dispatchPendingAnswer("")

      expect(pendingBox.innerHTML).toBe("")
      expect(pendingDataAttribute()).toBe("no")
      expect(title()).toBe("tsukumo")
    })
  })

  describe("入力欄の / コマンド補完（COMMANDS_PATH を1回だけ取りに行き、前方一致→部分一致で絞る）", () => {
    function setUpWithCommands(commands: readonly string[]) {
      return setUp(new Map([[COMMANDS_PATH, { commands }]]))
    }

    it("先頭が / のときだけ候補を出し、COMMANDS_PATH を取りに行く", async () => {
      const { textArea, suggestionsBox, calls } = setUpWithCommands(["clear", "model", "next-task"])

      textArea.value = "/"
      textArea.dispatchInput()
      await flushMicrotasks()

      expect(calls().map((call) => call.url)).toContain(COMMANDS_PATH)
      expect(suggestionsBox.hidden).toBe(false)
      expect(suggestionsBox.innerHTML).toContain("/clear")
      expect(suggestionsBox.innerHTML).toContain("/model")
      expect(suggestionsBox.innerHTML).toContain("/next-task")
    })

    it("前方一致で絞る", async () => {
      const { textArea, suggestionsBox } = setUpWithCommands(["clear", "model", "next-task"])

      textArea.value = "/ne"
      textArea.dispatchInput()
      await flushMicrotasks()

      expect(suggestionsBox.innerHTML).toContain("/next-task")
      expect(suggestionsBox.innerHTML).not.toContain("/clear")
      expect(suggestionsBox.innerHTML).not.toContain("/model")
    })

    it("前方一致が無いときは部分一致も出す（前方一致を先に、それぞれアルファベット順）", async () => {
      const { textArea, suggestionsBox } = setUpWithCommands(["plan-tasks", "next-task", "clear"])

      textArea.value = "/task"
      textArea.dispatchInput()
      await flushMicrotasks()

      const names = [...suggestionsBox.innerHTML.matchAll(/>\/([\w-]+)</g)].map((match) => match[1])
      expect(names).toEqual(["next-task", "plan-tasks"])
    })

    it("前方一致・部分一致がどちらもあるときは前方一致が先に並ぶ", async () => {
      const { textArea, suggestionsBox } = setUpWithCommands(["zzz-task", "task-list", "task-run"])

      textArea.value = "/task"
      textArea.dispatchInput()
      await flushMicrotasks()

      const names = [...suggestionsBox.innerHTML.matchAll(/>\/([\w-]+)</g)].map((match) => match[1])
      expect(names).toEqual(["task-list", "task-run", "zzz-task"])
    })

    it("入力が / だけのときはアルファベット順の先頭10件", async () => {
      const { textArea, suggestionsBox } = setUpWithCommands(["next-task", "clear", "model"])

      textArea.value = "/"
      textArea.dispatchInput()
      await flushMicrotasks()

      const names = [...suggestionsBox.innerHTML.matchAll(/>\/([\w-]+)</g)].map((match) => match[1])
      expect(names).toEqual(["clear", "model", "next-task"])
    })

    it("最大10件までに絞る", async () => {
      const many = Array.from({ length: 15 }, (_, index) => `cmd${String(index)}`)
      const { textArea, suggestionsBox } = setUpWithCommands(many)

      textArea.value = "/"
      textArea.dispatchInput()
      await flushMicrotasks()

      const matches = [...suggestionsBox.innerHTML.matchAll(/dispatch-suggestion-item/g)]
      expect(matches).toHaveLength(10)
    })

    it("空白を含む・先頭が / でない入力では候補を出さない", async () => {
      const { textArea, suggestionsBox } = setUpWithCommands(["clear"])

      textArea.value = "/clear "
      textArea.dispatchInput()
      await flushMicrotasks()
      expect(suggestionsBox.hidden).toBe(true)

      textArea.value = "clear"
      textArea.dispatchInput()
      await flushMicrotasks()
      expect(suggestionsBox.hidden).toBe(true)
    })

    it("IME 変換中の input では候補を操作しない", async () => {
      const { textArea, suggestionsBox } = setUpWithCommands(["clear"])

      textArea.value = "/"
      textArea.dispatchInput({ isComposing: true })
      await flushMicrotasks()

      expect(suggestionsBox.hidden).toBe(true)
    })

    it("答え待ちの箱がある間は候補を出さない", async () => {
      const { textArea, suggestionsBox, dispatchPendingAnswer } = setUpWithCommands(["clear"])
      dispatchPendingAnswer('<div class="pending-answer pending-permission"></div>')

      textArea.value = "/"
      textArea.dispatchInput()
      await flushMicrotasks()

      expect(suggestionsBox.hidden).toBe(true)
    })

    it("Tab で選ばれている候補を確定し、送信はしない", async () => {
      const { textArea, suggestionsBox, calls } = setUpWithCommands(["clear", "model"])

      textArea.value = "/"
      textArea.dispatchInput()
      await flushMicrotasks()

      const { event, wasPrevented } = makeFakeKeydownEvent({ key: "Tab" })
      textArea.dispatchKeydown(event)

      expect(wasPrevented()).toBe(true)
      expect(textArea.value).toBe("/clear ")
      expect(suggestionsBox.hidden).toBe(true)
      expect(calls().map((call) => call.url)).not.toContain(PROMPT_PATH)
    })

    it("候補が開いている間の Enter は選ばれている候補を確定して送信する（末尾の空白は付けない）", async () => {
      const { textArea, suggestionsBox, calls } = setUpWithCommands(["clear", "model"])

      textArea.value = "/"
      textArea.dispatchInput()
      await flushMicrotasks()

      const { event, wasPrevented } = makeFakeKeydownEvent({ key: "Enter" })
      textArea.dispatchKeydown(event)
      await flushMicrotasks()

      expect(wasPrevented()).toBe(true)
      expect(suggestionsBox.hidden).toBe(true)
      expect(calls().filter((call) => call.url === PROMPT_PATH)).toEqual([
        { url: PROMPT_PATH, body: JSON.stringify({ text: "/clear" }) },
      ])
    })

    it("送信中（進行中）の Enter は候補を確定するだけで、送信しない", async () => {
      const { textArea, suggestionsBox, calls, dispatchTurnStatus } = setUpWithCommands([
        "clear",
        "model",
      ])
      dispatchTurnStatus(TURN_STATUS_IN_PROGRESS)

      textArea.value = "/"
      textArea.dispatchInput()
      await flushMicrotasks()

      const { event, wasPrevented } = makeFakeKeydownEvent({ key: "Enter" })
      textArea.dispatchKeydown(event)
      await flushMicrotasks()

      expect(wasPrevented()).toBe(true)
      expect(textArea.value).toBe("/clear ")
      expect(suggestionsBox.hidden).toBe(true)
      expect(calls().map((call) => call.url)).not.toContain(PROMPT_PATH)
    })

    it("候補が開いていないときの Enter は、これまでどおり送信する", async () => {
      const { textArea, calls } = setUpWithCommands(["clear"])
      textArea.value = "こんにちは"

      const { event } = makeFakeKeydownEvent({ key: "Enter" })
      textArea.dispatchKeydown(event)
      await flushMicrotasks()

      expect(calls()).toEqual([{ url: PROMPT_PATH, body: JSON.stringify({ text: "こんにちは" }) }])
    })

    it("候補をクリック（mousedown）で確定し、フォーカスを奪わず送信もしない", async () => {
      const { textArea, suggestionsBox, calls } = setUpWithCommands(["clear", "model", "next-task"])

      textArea.value = "/"
      textArea.dispatchInput()
      await flushMicrotasks()

      const { wasPrevented } = suggestionsBox.clickItem(1)

      expect(wasPrevented()).toBe(true)
      expect(textArea.value).toBe("/model ")
      expect(suggestionsBox.hidden).toBe(true)
      expect(calls().map((call) => call.url)).not.toContain(PROMPT_PATH)
    })

    it("Esc で候補を閉じる（入力欄の文字列は変えない）", async () => {
      const { textArea, suggestionsBox } = setUpWithCommands(["clear", "model"])

      textArea.value = "/"
      textArea.dispatchInput()
      await flushMicrotasks()

      const { event } = makeFakeKeydownEvent({ key: "Escape" })
      textArea.dispatchKeydown(event)

      expect(suggestionsBox.hidden).toBe(true)
      expect(textArea.value).toBe("/")
    })

    it("一覧は最初の / の1回だけ取りに行き、以降は取り直さない（セッション中キャッシュ）", async () => {
      const { textArea, calls } = setUpWithCommands(["clear"])

      textArea.value = "/"
      textArea.dispatchInput()
      await flushMicrotasks()
      textArea.value = "/c"
      textArea.dispatchInput()
      await flushMicrotasks()

      expect(calls().filter((call) => call.url === COMMANDS_PATH)).toHaveLength(1)
    })
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

  it("右下の入力ペインに、複数行入力・送信ボタンのフォームを持つ（送り先の選択は無い）", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

    expect(page).toContain('<section class="layout-region layout-dispatch"')
    expect(page).toContain('<form id="tsukumo-dispatch-form">')
    expect(page).toContain('<textarea id="tsukumo-dispatch-text"')
  })

  it("入力欄の領域に、答え待ちの箱の置き場所を持つ（textarea より上、既定は data-pending=no）", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

    const regionIndex = page.indexOf('id="tsukumo-view-dispatch" data-pending="no"')
    const pendingBoxIndex = page.indexOf(
      '<div class="dispatch-pending" id="tsukumo-dispatch-pending">',
    )
    const textareaIndex = page.indexOf('<textarea id="tsukumo-dispatch-text"')

    expect(regionIndex).toBeGreaterThan(-1)
    expect(pendingBoxIndex).toBeGreaterThan(regionIndex)
    expect(textareaIndex).toBeGreaterThan(pendingBoxIndex)
  })

  it("送り先を選ぶ <select> を持たず、DISPATCH_PATH / TERMINALS_PATH は入力欄から呼ばれない", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

    expect(page).not.toContain('<select id="tsukumo-dispatch-target"')
    expect(page).not.toContain(`fetch(${JSON.stringify(TERMINALS_PATH)})`)
    expect(page).not.toContain(`fetch(${JSON.stringify(DISPATCH_PATH)}`)
  })

  it("依頼の送信・中断を、経路の定数（PROMPT_PATH / INTERRUPT_PATH / TURN_STATUS_EVENT_PATH）宛に行う", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

    expect(page).toContain(`fetch(${JSON.stringify(PROMPT_PATH)}`)
    expect(page).toContain(`fetch(${JSON.stringify(INTERRUPT_PATH)}`)
    expect(page).toContain(`new EventSource(${JSON.stringify(TURN_STATUS_EVENT_PATH)})`)
  })

  it("送信ボタンは初期状態で「送信」（無効ではない。送信先の選択が要らなくなったため）", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

    expect(page).toContain(
      '<button type="submit" id="tsukumo-dispatch-send" class="dispatch-send">送信</button>',
    )
  })
})

describe("まとめたレイアウトページの仕切り（3本のドラッグ・既定値・localStorage）", () => {
  it("3本の仕切りと、既定に戻すボタンを持つ", () => {
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

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
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

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
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

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
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })
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
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })
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
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })
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
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

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
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })

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
    const page = buildLayoutPage({ main: "", character: "", sidebar: "" })
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

describe("ツール名＋入力の要約（summarizeToolInput）", () => {
  it("Bash はコマンドを出す", () => {
    expect(summarizeToolInput("Bash", { command: "echo dummy" })).toBe("echo dummy")
  })

  it("Edit はファイルパスを出す", () => {
    expect(
      summarizeToolInput("Edit", {
        file_path: "/tmp/dummy.txt",
        old_string: "a",
        new_string: "b",
      }),
    ).toBe("/tmp/dummy.txt")
  })

  it("未知のツールは入力の最初の文字列値を出す", () => {
    expect(summarizeToolInput("MysteryTool", { note: "ダミーの説明", count: 3 })).toBe(
      "ダミーの説明",
    )
  })

  it("120文字を超えたら切り詰める（入力の全文は出さない）", () => {
    const long = "a".repeat(200)

    const summary = summarizeToolInput("Bash", { command: long })

    expect(summary.length).toBeLessThan(long.length)
    expect(summary).toEndWith("…")
  })

  it("要約に使わないフィールドの値は混ざらない", () => {
    const summary = summarizeToolInput("Bash", { command: "echo dummy", secret: "内緒" })

    expect(summary).not.toContain("内緒")
  })

  it("入力がオブジェクトの形でないときは空文字", () => {
    expect(summarizeToolInput("Bash", "echo dummy")).toBe("")
    expect(summarizeToolInput("Bash", undefined)).toBe("")
  })
})

describe("答え待ちの箱（キャラビューの吹き出しの直下。buildPendingAnswerBody）", () => {
  it("答え待ちが無いときは空を返す", () => {
    expect(buildPendingAnswerBody(undefined)).toBe("")
  })

  it("許可要求はツール名・要約・許可・拒否ボタンを出す", () => {
    const body = buildPendingAnswerBody({
      kind: "permission",
      id: "toolu_1",
      toolName: "Bash",
      input: { command: "echo dummy" },
    })

    expect(body).toContain('data-pending-id="toolu_1"')
    expect(body).toContain("Bash")
    expect(body).toContain("echo dummy")
    expect(body).toContain("許可")
    expect(body).toContain("拒否")
  })

  it("質問は見出し・本文・選択肢を番号付きの一覧で出す", () => {
    const body = buildPendingAnswerBody({
      kind: "question",
      id: "toolu_q",
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
    })

    expect(body).toContain("質問をどのビューに出す？")
    expect(body).toContain("出す場所")
    expect(body).toContain('data-label="メインビュー"')
    expect(body).toContain("作業の記録として出す")
    expect(body).toContain('data-label="吹き出し"')
  })

  it("質問には拒否ボタンを出さない（答えないと会話が進まないため）", () => {
    const body = buildPendingAnswerBody({
      kind: "question",
      id: "toolu_q",
      questions: [
        { header: "h", text: "t", multiSelect: false, options: [{ label: "a", description: "" }] },
      ],
    })

    expect(body).not.toContain("拒否")
  })

  it("質問が1件だけの単一選択には「答える」ボタンを出さない（選ぶと即送るため）", () => {
    const body = buildPendingAnswerBody({
      kind: "question",
      id: "toolu_q",
      questions: [
        { header: "h", text: "t", multiSelect: false, options: [{ label: "a", description: "" }] },
      ],
    })

    expect(body).not.toContain("pending-answer-submit")
  })

  it("複数選べる質問はその旨を出し、「答える」ボタンを出す", () => {
    const body = buildPendingAnswerBody({
      kind: "question",
      id: "toolu_q",
      questions: [
        {
          header: "h",
          text: "t",
          multiSelect: true,
          options: [
            { label: "a", description: "" },
            { label: "b", description: "" },
          ],
        },
      ],
    })

    expect(body).toContain("複数選べる")
    expect(body).toContain("pending-answer-submit")
  })

  it("質問が2件以上のときも「答える」ボタンを出す（全部答えてから送るため）", () => {
    const body = buildPendingAnswerBody({
      kind: "question",
      id: "toolu_q",
      questions: [
        {
          header: "h1",
          text: "t1",
          multiSelect: false,
          options: [{ label: "a", description: "" }],
        },
        {
          header: "h2",
          text: "t2",
          multiSelect: false,
          options: [{ label: "b", description: "" }],
        },
      ],
    })

    expect(body).toContain("pending-answer-submit")
  })

  it("「その他」の選択肢は自由入力欄と送るボタンにする", () => {
    const body = buildPendingAnswerBody({
      kind: "question",
      id: "toolu_q",
      questions: [
        {
          header: "h",
          text: "t",
          multiSelect: false,
          options: [{ label: "その他", description: "" }],
        },
      ],
    })

    expect(body).toContain('class="question-other-input"')
    expect(body).toContain("送る")
  })

  it("質問文や選択肢に HTML が混ざっていてもエスケープする", () => {
    const body = buildPendingAnswerBody({
      kind: "question",
      id: "toolu_q",
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
})

describe("キャラビューは立ち絵と吹き出しだけ（答え待ちの箱は入力欄側へ移した）", () => {
  it("答え待ちの箱を出さない（CharacterViewData に pending フィールド自体が無い）", () => {
    const body = buildCharacterBody(FULL_CHARACTER_DATA)

    expect(body).not.toContain("pending-answer")
  })

  it("許可モードの select はキャラビューには出さない（サイドバーへ移した）", () => {
    const body = buildCharacterBody(FULL_CHARACTER_DATA)

    expect(body).not.toContain("permission-mode-select")
  })
})

describe("メインビューに残る質問の記録（過去の質問と選ばれた答え）", () => {
  const historyQuestions = [
    {
      header: "出す場所",
      text: "質問をどのビューに出す？",
      multiSelect: false,
      options: [
        { label: "メインビュー", description: "作業の記録として出す" },
        { label: "吹き出し", description: "キャラビューに出す" },
      ],
    },
  ]

  it("聞いたこと・選んだ答えが記録として残る", () => {
    const body = buildMainBody([
      { kind: "question", questions: historyQuestions, answers: ["メインビュー"] },
    ])

    expect(body).toContain("質問をどのビューに出す？")
    expect(body).toContain("● メインビュー")
    expect(body).toContain("○ 吹き出し")
  })

  it("答えが分からない質問（差し戻しなど）は、印を付けずに選択肢だけ出す", () => {
    const body = buildMainBody([{ kind: "question", questions: historyQuestions, answers: [] }])

    expect(body).toContain("○ メインビュー")
    expect(body).not.toContain("●")
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

  // 本文を書きかけのままリアルタイムに流す（docs/requirements.md 4.2）ので、ここに来る
  // markdown は閉じ切っていないことがある。仮描画で例外が出ると更新そのものが止まってしまうため、
  // 壊れた入力でも例外を投げないことを確かめる（描けなければ素のテキストのまま出ればよい）。
  it("閉じていないコードブロックの書きかけ本文でも例外を投げない", () => {
    const markdown = "着手します\n```ts\nconst a = 1\nfunction f() {\n  return a"
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    expect(() => buildMainBody(entries)).not.toThrow()
    expect(buildMainBody(entries)).toContain("const a = 1")
  })

  it("閉じていない表の書きかけ本文でも例外を投げない", () => {
    const markdown = "結果はこちら\n| A | B |\n| --- | --- |\n| 1 | 2"
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    expect(() => buildMainBody(entries)).not.toThrow()
    expect(buildMainBody(entries)).toContain("<table>")
  })

  it("途中で切れた HTML タグの書きかけ本文でも例外を投げない", () => {
    const markdown = '図を描きます\n<div class="card"><p>本文<span class="em'
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    expect(() => buildMainBody(entries)).not.toThrow()
    expect(buildMainBody(entries)).toContain("本文")
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
  it("3つの区画（いま何をしているか・タスク一覧・セッション情報）を並べる", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("いま何をしているか")
    expect(body).toContain("タスク一覧")
    expect(body).toContain("セッション情報")
    expect(body).not.toContain("コンテキスト使用量")
  })

  it("実行中は普通の色、完了は薄い色で出す。サブエージェントの中は1段下げる", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain('<li class="activity-item activity-running">Bash: echo dummy</li>')
    expect(body).toContain('<li class="activity-item activity-finished">Edit: src/dummy.ts</li>')
    expect(body).toContain(
      '<li class="activity-item activity-finished activity-nested">Read: src/dummy2.ts</li>',
    )
  })

  it("実行中・完了のどちらも無いときは、その旨を出す", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      activity: { running: [], finished: [] },
    })

    expect(body).toContain("いま動いているツールは無い")
  })

  it("タスク一覧は id・summary・status をファイルの順で出し、done は薄く出す", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body.indexOf("X-001")).toBeLessThan(body.indexOf("X-002"))
    expect(body).toContain("架空のサイドバー実装")
    expect(body).toContain('<li class="task-item task-done">')
    expect(body).toContain('<span class="task-status">todo</span>')
  })

  it("develop/tasks.json が読めない（tasks が undefined）とき、その区画だけ「不明」を出し、残りは壊れない", () => {
    const body = buildSidebarBody({ ...FULL_SIDEBAR_DATA, tasks: undefined })

    expect(body).toContain("不明")
    expect(body).toContain("Bash: echo dummy")
  })

  it("タスクが0件のときは、その旨を出す", () => {
    const body = buildSidebarBody({ ...FULL_SIDEBAR_DATA, tasks: [] })

    expect(body).toContain("タスクが無い")
  })

  it("セッション情報にモデル・許可モードの select と経過時間の枠を出す", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain('class="model-select"')
    expect(body).toContain('class="permission-mode-select')
    expect(body).toContain('data-started-at="1700000000000"')
  })

  it("turnStartedAt が未定のときは data-started-at が空", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      session: { ...FULL_SIDEBAR_DATA.session, turnStartedAt: undefined },
    })

    expect(body).toContain('data-started-at=""')
  })

  it("ツール入力の要約を、HTML として無害な形にして埋め込む", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      activity: {
        running: [
          { name: "Bash", input: { command: '<script>alert("x")</script>' }, nested: false },
        ],
        finished: [],
      },
    })

    expect(body).not.toContain("<script>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("タスクの summary を、HTML として無害な形にして埋め込む", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      tasks: [{ id: "X-001", summary: '<script>alert("x")</script>', status: undefined }],
    })

    expect(body).not.toContain("<script>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("すべて取れない・空のときも例外を投げずに組み立てる", () => {
    const body = buildSidebarBody({
      activity: { running: [], finished: [] },
      tasks: undefined,
      session: { model: undefined, permissionMode: undefined, turnStartedAt: undefined },
    })

    expect(body).toContain("いま何をしているか")
    expect(body).toContain("タスク一覧")
    expect(body).toContain("セッション情報")
  })
})

describe("サイドバーのモデル select（modelSelectHtml）", () => {
  it("model にエイリアスが含まれていればそれを選択済みにする", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      session: { ...FULL_SIDEBAR_DATA.session, model: "claude-opus-4-1" },
    })

    expect(body).toContain('<option value="opus" selected>')
  })

  it("model が未定のときは既定（sonnet）を選択済みにする", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      session: { ...FULL_SIDEBAR_DATA.session, model: undefined },
    })

    expect(body).toContain('<option value="sonnet" selected>')
  })

  it("選択肢はエイリアスの3つだけ（フルネームは出さない）", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain('<option value="opus"')
    expect(body).toContain('<option value="sonnet"')
    expect(body).toContain('<option value="haiku"')
    expect(body).not.toContain("claude-opus")
  })
})

describe("サイドバーの許可モード select（moved from キャラビュー）", () => {
  it("いまの許可モードを選択済みにする", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      session: { ...FULL_SIDEBAR_DATA.session, permissionMode: "plan" },
    })

    expect(body).toContain('<option value="plan" selected>')
  })

  it("permissionMode が未定のときは既定（auto）を選択済みにする", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      session: { ...FULL_SIDEBAR_DATA.session, permissionMode: undefined },
    })

    expect(body).toContain('<option value="auto" selected>')
  })

  it("bypassPermissions のときは警告クラスを付ける", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      session: { ...FULL_SIDEBAR_DATA.session, permissionMode: "bypassPermissions" },
    })

    expect(body).toContain("permission-mode-select-danger")
  })

  it("bypassPermissions 以外では警告クラスを付けない", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      session: { ...FULL_SIDEBAR_DATA.session, permissionMode: "auto" },
    })

    expect(body).not.toContain("permission-mode-select-danger")
  })
})

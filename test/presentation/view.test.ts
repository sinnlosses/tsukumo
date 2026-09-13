import { afterEach, beforeEach, describe, expect, it } from "bun:test"

import {
  bindLayoutResizer,
  type LayoutResizerElements,
} from "../../src/presentation/browser/layout-resizer.ts"
import { bindMainTurns } from "../../src/presentation/browser/main-turns.ts"
import {
  subscribeAllRegions,
  subscribeRegion,
} from "../../src/presentation/browser/region-subscription.ts"
import {
  buildCharacterBody,
  buildLayoutPage,
  buildMainBody,
  type CharacterViewData,
  isViewName,
  LAYOUT_PATH,
  type LayoutBodies,
  VIEW_NAMES,
  viewEventPath,
  type ViewName,
} from "../../src/presentation/view.ts"
import { type MainViewEntry } from "../../src/protocol/session-state.ts"

// buildCharacterBody に渡す全部入りのデータ。個々のテストは必要な部分だけ上書きする。
const FULL_CHARACTER_DATA: CharacterViewData = {
  speeches: ["やあ、調子はどう？"],
  portrait: { kind: "svg", svgMarkup: '<svg role="img"><circle r="1"/></svg>' },
  outfitAccent: "#b8c7ff",
  altText: "架空の精霊（通常）",
}

// --- SSE 購読スクリプトを実際に動かして確かめるための道具 -------------------------------------
//
// 生成された <script> の中身（本番と同じ文字列）を node:vm で実行し、「本文が前回と同じ update
// イベントでは差し替えない」「差し替えは Idiomorph の morph で行い、いちばん下から24px以内の
// ときだけ追従してスクロールする」という制御フローだけを固定する。ブラウザに実際に絵が出ているか
// どうか（描画そのもの）はここでは確かめない（docs/coding-standards.md「描画は自動テストで
// 守らない」）。**本物の Idiomorph は使わず、`morph` を代役に差し替える**（下の
// `runSubscriptionScript` が vm のグローバルへ渡す）。

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
 * `src/presentation/browser/layout-resizer.ts` の {@link bindLayoutResizer} を直接呼ぶ（2026-09-12 T-084。
 * 以前はページに埋め込まれた文字列を vm で動かしていた）。`localStorage` はブラウザの
 * グローバルなので、呼び出し前に代役へ差し替える（呼び出し側の `beforeEach`/`afterEach` で
 * 元に戻す）。
 */
function runLayoutScript(
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
  ;(globalThis as Record<string, unknown>)["localStorage"] = localStorageStub

  bindLayoutResizer(elements as unknown as LayoutResizerElements)
}

function singleRegionLayoutPage(view: ViewName, body: string): string {
  const bodies: LayoutBodies = { main: "", character: "", [view]: body }
  return buildLayoutPage(bodies)
}

describe("SSEの更新の適用（本文が同じなら差し替えない・morph でスクロール位置を保つ）", () => {
  // 購読の仕組みは `src/presentation/browser/region-subscription.ts`（ブラウザで動く本物の TypeScript）に
  // あるので、**モジュールを直接呼んで確かめる**（2026-09-12 T-083。以前はページに埋め込まれた
  // 文字列を vm で動かしていた）。`EventSource` と `window.Idiomorph` はブラウザのグローバルなので、
  // テストの間だけ代役に差し替える。
  type FakeSource = {
    readonly path: string
    readonly emit: (data: string) => void
  }

  let sources: FakeSource[] = []
  let morphCalls: Array<{ readonly target: unknown; readonly html: string }> = []
  let originalEventSource: unknown
  let originalIdiomorph: unknown
  let originalDocument: unknown

  beforeEach(() => {
    sources = []
    morphCalls = []
    originalEventSource = (globalThis as Record<string, unknown>)["EventSource"]
    originalIdiomorph = (globalThis as Record<string, unknown>)["window"]
    originalDocument = (globalThis as Record<string, unknown>)["document"]

    class StubEventSource {
      private readonly listeners = new Set<(event: { data: string }) => void>()
      constructor(readonly url: string) {
        sources.push({
          path: url,
          emit: (data) => {
            for (const listener of this.listeners) {
              listener({ data })
            }
          },
        })
      }
      addEventListener(_type: string, listener: (event: { data: string }) => void): void {
        this.listeners.add(listener)
      }
    }

    ;(globalThis as Record<string, unknown>)["EventSource"] = StubEventSource
    // `document` はテスト環境（Bun）に無いので代役を置く。`scrollerFor` が
    // 領域が縦にあふれていないときの逃げ先として触る。
    ;(globalThis as Record<string, unknown>)["document"] = {
      querySelectorAll: () => [],
      scrollingElement: { scrollHeight: 0, clientHeight: 0, scrollTop: 0 },
      documentElement: { scrollHeight: 0, clientHeight: 0, scrollTop: 0 },
    }
    ;(globalThis as Record<string, unknown>)["window"] = {
      Idiomorph: {
        morph: (target: unknown, html: string) => {
          morphCalls.push({ target, html })
        },
      },
    }
  })

  afterEach(() => {
    ;(globalThis as Record<string, unknown>)["EventSource"] = originalEventSource
    ;(globalThis as Record<string, unknown>)["window"] = originalIdiomorph
    ;(globalThis as Record<string, unknown>)["document"] = originalDocument
  })

  /** 購読対象の要素の代役。スクロールの寸法と innerHTML だけを持つ。 */
  function fakeRegion(options: {
    readonly innerHTML: string
    readonly scrollHeight?: number
    readonly clientHeight?: number
    readonly scrollTop?: number
  }): Element & { scrollTop: number } {
    return {
      innerHTML: options.innerHTML,
      scrollHeight: options.scrollHeight ?? 100,
      clientHeight: options.clientHeight ?? 100,
      scrollTop: options.scrollTop ?? 0,
    } as unknown as Element & { scrollTop: number }
  }

  it("ページは購読を埋め込まず、外に出したスクリプトを読む（/assets/browser.js）", () => {
    const page = singleRegionLayoutPage("main", "<p>さいしょ</p>")

    expect(page).toContain('<script src="/assets/browser.js"></script>')
    expect(page).not.toContain('new EventSource("/events/main")')
  })

  it("ページが Idiomorph 本体（/vendor/idiomorph.min.js）を読み込む", () => {
    const page = singleRegionLayoutPage("main", "<p>さいしょ</p>")

    expect(page).toContain('<script src="/vendor/idiomorph.min.js"></script>')
  })

  it("領域は data-event-path で購読先を示す（ブラウザ側はこれを見て回る）", () => {
    const page = buildLayoutPage({ main: "m", character: "c" })

    for (const view of VIEW_NAMES) {
      expect(page).toContain(`data-event-path="/events/${view}"`)
    }
  })

  it("サイドバーの領域は data-event-path を持たない（React の root を mount する側。段3）", () => {
    const page = buildLayoutPage({ main: "m", character: "c" })

    expect(page).toContain(
      '<section class="layout-region layout-sidebar" id="tsukumo-view-sidebar"></section>',
    )
  })

  it("data-event-path を持つ要素を見つけたぶんだけ購読する", () => {
    const regions = [
      { ...fakeRegion({ innerHTML: "<p>m</p>" }), getAttribute: () => "/events/main" },
      { ...fakeRegion({ innerHTML: "<p>c</p>" }), getAttribute: () => "/events/character" },
      // 属性が空の要素は購読しない（`data-event-path` が付いていない領域の代わり。
      // サイドバーは段3以降ここに当たる）。
      { ...fakeRegion({ innerHTML: "" }), getAttribute: () => "" },
    ]
    ;(globalThis as Record<string, unknown>)["document"] = {
      querySelectorAll: () => regions,
      scrollingElement: { scrollHeight: 0, clientHeight: 0, scrollTop: 0 },
      documentElement: { scrollHeight: 0, clientHeight: 0, scrollTop: 0 },
    }

    subscribeAllRegions()

    expect(sources.map((s) => s.path)).toEqual(["/events/main", "/events/character"])
  })

  it("購読直後の1回目の push が、いま出ている本文と同じときは差し替えない", () => {
    const region = fakeRegion({ innerHTML: "<p>さいしょ</p>" })
    subscribeRegion(region, "/events/main")

    sources[0]?.emit("<p>さいしょ</p>")

    expect(morphCalls).toEqual([])
  })

  it("本文が前回と同じ update イベントが続いても、差し替えは起きない", () => {
    const region = fakeRegion({ innerHTML: "<p>さいしょ</p>" })
    subscribeRegion(region, "/events/main")

    sources[0]?.emit("<p>つぎ</p>")
    sources[0]?.emit("<p>つぎ</p>")

    expect(morphCalls.length).toBe(1)
  })

  it("本文が変わった update イベントでは morph で差し替える", () => {
    const region = fakeRegion({ innerHTML: "<p>さいしょ</p>" })
    subscribeRegion(region, "/events/main")

    sources[0]?.emit("<p>つぎ</p>")

    expect(morphCalls.length).toBe(1)
    expect(morphCalls[0]?.html).toBe("<p>つぎ</p>")
    expect(morphCalls[0]?.target).toBe(region)
  })

  it("差し替え前にいちばん下から24px以内を見ていたときは、差し替え後もいちばん下へ追従する", () => {
    const region = fakeRegion({
      innerHTML: "<p>さいしょ</p>",
      scrollHeight: 1000,
      clientHeight: 200,
      scrollTop: 790,
    })
    subscribeRegion(region, "/events/main")

    sources[0]?.emit("<p>つぎ</p>")

    expect(region.scrollTop).toBe(1000)
  })

  it("差し替え前にいちばん下から離れていたときは、差し替え後も元のスクロール位置を保つ", () => {
    const region = fakeRegion({
      innerHTML: "<p>さいしょ</p>",
      scrollHeight: 1000,
      clientHeight: 200,
      scrollTop: 100,
    })
    subscribeRegion(region, "/events/main")

    sources[0]?.emit("<p>つぎ</p>")

    expect(region.scrollTop).toBe(100)
  })
})

describe("SSEの更新の経路", () => {
  it("更新の経路が、ビューごとに別々になる", () => {
    const eventPaths = VIEW_NAMES.map((view) => viewEventPath(view))

    expect(new Set(eventPaths).size).toBe(eventPaths.length)
  })

  it("知らないビュー名を弾く", () => {
    expect(isViewName("character")).toBe(true)
    expect(isViewName("balloon")).toBe(false)
  })
})

describe("レイアウトページの基本", () => {
  it("タイトルは固定で「tsukumo」（個別ビューのページ・タイトルは 2026-09-12 に消した）", () => {
    const page = buildLayoutPage({ main: "", character: "" })

    expect(page).toStartWith("<!doctype html>")
    expect(page).toContain("<title>tsukumo</title>")
  })

  it("CSS はインラインの <style> ではなく、/assets/style.css への <link> で読む（2026-09-12）", () => {
    const page = buildLayoutPage({ main: "", character: "" })

    expect(page).toContain('<link rel="stylesheet" href="/assets/style.css">')
    expect(page).not.toContain("<style>")
  })

  it("`/` は個別ビューのページの一覧ではなく、まとめたレイアウトページそのもの（LAYOUT_PATH）", () => {
    expect(LAYOUT_PATH).toBe("/")
  })
})

describe("まとめたレイアウトページ", () => {
  it("経路が SSE の更新の経路と重ならない", () => {
    const eventPaths = VIEW_NAMES.map((view) => viewEventPath(view))

    expect(eventPaths).not.toContain(LAYOUT_PATH)
  })

  it("メイン・キャラの本文を、対応する id の要素に埋め込む。サイドバーは空のまま（React が mount する）", () => {
    const page = buildLayoutPage({
      main: "<p>作業ちゅう</p>",
      character: "<p>やあ</p>",
    })

    expect(page).toContain(
      '<section class="layout-region layout-main" id="tsukumo-view-main" data-event-path="/events/main" data-mermaid-src="/vendor/mermaid.min.js" data-chart-src="/vendor/chart.umd.min.js"><p>作業ちゅう</p></section>',
    )
    expect(page).toContain(
      '<section class="layout-region layout-character" id="tsukumo-view-character" data-event-path="/events/character"><p>やあ</p></section>',
    )
    expect(page).toContain(
      '<section class="layout-region layout-sidebar" id="tsukumo-view-sidebar"></section>',
    )
  })

  it("3領域それぞれが、自分の要素に /events/<view> を示して個別に購読される", () => {
    const page = buildLayoutPage({ main: "", character: "" })

    // 購読そのものは外に出したスクリプト（`src/presentation/browser/region-subscription.ts`）が、この属性を
    // 見て回る（2026-09-12 T-083）。ページが持つのは「どの要素がどの経路か」だけ。
    for (const view of VIEW_NAMES) {
      expect(page).toContain(`id="tsukumo-view-${view}" data-event-path="${viewEventPath(view)}"`)
    }
  })

  it("右下の入力欄の領域は空のまま（React が mount する。段4 でサイドバーと同じ形にした）", () => {
    const page = buildLayoutPage({ main: "", character: "" })

    expect(page).toContain(
      '<section class="layout-region layout-dispatch" id="tsukumo-view-dispatch"></section>',
    )
  })
})

describe("まとめたレイアウトページの仕切り（3本のドラッグ・既定値・localStorage）", () => {
  // `bindLayoutResizer` はブラウザのグローバル（`localStorage`）をそのまま使うので、テストの間
  // だけ代役に差し替え、後始末する。
  let originalLocalStorage: unknown

  beforeEach(() => {
    originalLocalStorage = (globalThis as Record<string, unknown>)["localStorage"]
  })

  afterEach(() => {
    ;(globalThis as Record<string, unknown>)["localStorage"] = originalLocalStorage
  })

  it("3本の仕切りと、既定に戻すボタンを持つ", () => {
    const page = buildLayoutPage({ main: "", character: "" })

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

    runLayoutScript(
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

    expect(() =>
      runLayoutScript(
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
    const broken = JSON.stringify({ rowTop: 999, topLeft: "abc", bottomLeft: 35 })

    expect(() =>
      runLayoutScript(
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
    const saved = JSON.stringify({ rowTop: 50, topLeft: 60, bottomLeft: 45 })

    runLayoutScript(
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
    let savedValue: string | undefined

    runLayoutScript(
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

    runLayoutScript(
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

    runLayoutScript(
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
    let savedValue: string | undefined

    runLayoutScript(
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

/**
 * `src/presentation/browser/main-turns.ts` の {@link bindMainTurns} を直接呼ぶ（2026-09-12 T-084。以前は
 * ページに埋め込まれた文字列を vm で動かしていた）。
 */
function runMainTurnsScript(initialTurnIds: readonly string[]): FakeTurnsHandle {
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

  ;(globalThis as Record<string, unknown>)["MutationObserver"] = observer.MutationObserverClass
  ;(globalThis as Record<string, unknown>)["document"] = {
    scrollingElement: element,
    documentElement: element,
  }

  bindMainTurns(element as unknown as Element)

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
  // `bindMainTurns` はブラウザのグローバル（`MutationObserver` / `document`）をそのまま使うので、
  // テストの間だけ代役に差し替え、後始末する。
  let originalMutationObserver: unknown
  let originalDocument: unknown

  beforeEach(() => {
    originalMutationObserver = (globalThis as Record<string, unknown>)["MutationObserver"]
    originalDocument = (globalThis as Record<string, unknown>)["document"]
  })

  afterEach(() => {
    ;(globalThis as Record<string, unknown>)["MutationObserver"] = originalMutationObserver
    ;(globalThis as Record<string, unknown>)["document"] = originalDocument
  })

  it("最初は今回（左端）のやり取りが選ばれている", () => {
    const handle = runMainTurnsScript(["3", "2", "1"])
    handle.pushUpdate()

    expect(handle.activeTabId()).toBe("3")
    expect(handle.visiblePanelIds()).toEqual(["3"])
  })

  it("過去のタブを選ぶとそのやり取りだけが見え、先頭から読める位置に戻る", () => {
    const handle = runMainTurnsScript(["3", "2", "1"])
    handle.pushUpdate()
    handle.setScrollTop(400)

    handle.clickTab("1")

    expect(handle.visiblePanelIds()).toEqual(["1"])
    expect(handle.scrollTop()).toBe(0)
  })

  it("本文が差し替わっても、選んでいた過去のタブが選ばれたまま残る", () => {
    const handle = runMainTurnsScript(["3", "2", "1"])
    handle.pushUpdate()
    handle.clickTab("2")

    // 今回のやり取りに記録が増えただけの push（やり取りの数は変わらない）。
    handle.pushUpdate()

    expect(handle.activeTabId()).toBe("2")
    expect(handle.visiblePanelIds()).toEqual(["2"])
  })

  it("新しいやり取りが始まると、今回を見ていた人は新しい先頭へ移る", () => {
    const handle = runMainTurnsScript(["3", "2", "1"])
    handle.pushUpdate()
    handle.setScrollTop(400)

    handle.setTurns(["4", "3", "2", "1"])
    handle.pushUpdate()

    expect(handle.activeTabId()).toBe("4")
    expect(handle.scrollTop()).toBe(0)
  })

  it("過去のタブを見ている間は、新しいやり取りが始まっても動かさない", () => {
    const handle = runMainTurnsScript(["3", "2", "1"])
    handle.pushUpdate()
    handle.clickTab("1")
    handle.setScrollTop(400)

    handle.setTurns(["4", "3", "2", "1"])
    handle.pushUpdate()

    expect(handle.activeTabId()).toBe("1")
    expect(handle.scrollTop()).toBe(400)
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
    const page = singleRegionLayoutPage("main", buildMainBody([]))

    expect(page).toContain('href="/vendor/highlight-theme.min.css"')
    expect(page).toContain('src="/vendor/highlight.min.js"')
    expect(page).toContain('src="/vendor/idiomorph.min.js"')
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

  it("依頼の見出しには全行を出す（複数行の依頼を読めるように 2026-09-12）", () => {
    const body = buildMainBody([request("1行目\n2行目\n3行目"), detail("x")])

    expect(body).toContain("2行目")
    expect(body).toContain("3行目")
  })

  it("タブのラベルに依頼の文面は出ない（出すのは「今回」「1つ前」だけ）", () => {
    const body = buildMainBody([
      request("前の依頼\n前の2行目"),
      detail("前のレポート"),
      request("今回の依頼\n今回の2行目"),
      detail("今回のレポート"),
    ])

    const tabsHtml = /<div class="turn-tabs"[\s\S]*?<\/div>/.exec(body)?.[0] ?? ""
    expect(tabsHtml).not.toBe("")
    expect(tabsHtml).not.toContain("前の2行目")
    expect(tabsHtml).not.toContain("今回の2行目")
  })

  it("見出しの全文にも上限が効き、長すぎるものは切り詰めの印が付く", () => {
    const longLine = "あ".repeat(3000)
    const body = buildMainBody([request(longLine), detail("x")])

    expect(body).toContain("…")
    expect(body).not.toContain(longLine)
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

  it("段落の途中に書いたインライン HTML（許可リストのタグ）はタグとして出る", () => {
    const markdown = '状態は <span class="badge badge-ok">あり</span> です。'
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).toContain('<span class="badge badge-ok">あり</span>')
  })

  it("表のセルの途中に書いたインライン HTML もタグとして出る", () => {
    const markdown = ["| 状態 |", "| --- |", '| <span class="badge badge-ok">あり</span> |'].join(
      "\n",
    )
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).toContain('<span class="badge badge-ok">あり</span>')
  })

  it("箇条書きの項目の途中に書いたインライン HTML もタグとして出る", () => {
    const markdown = '- 状態は <span class="badge badge-ok">あり</span> です。'
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).toContain('<span class="badge badge-ok">あり</span>')
  })

  it("段落の途中でも、許可リストに無いタグ（script）はタグとして出ない", () => {
    const markdown = '危険 <script>alert("x")</script> です。'
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).not.toContain("<script>")
    expect(body).not.toContain("alert(")
  })

  it("コードスパンで囲んだインライン HTML は、タグにならず文字のまま出る", () => {
    const markdown = "書き方は `<span>` です。"
    const entries: readonly MainViewEntry[] = [{ kind: "detail", markdown }]

    const body = buildMainBody(entries)

    expect(body).toContain("<code>&lt;span&gt;</code>")
    expect(body).not.toContain("<span>")
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
      speeches: ['<script>alert("x")</script>'],
    })

    expect(body).not.toContain("<script>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("セリフがまだ無い（一度も発話が無い）ときはプレースホルダを出す", () => {
    const body = buildCharacterBody({ ...FULL_CHARACTER_DATA, speeches: [] })

    expect(body).toContain("まだ発話がありません")
  })

  it("セリフの件数と同じ数の吹き出しを出す", () => {
    const body = buildCharacterBody({
      ...FULL_CHARACTER_DATA,
      speeches: ["1つめ", "2つめ", "3つめ"],
    })

    expect(body.match(/<div class="balloon">/g)?.length).toBe(3)
    expect(body).toContain("1つめ")
    expect(body).toContain("2つめ")
    expect(body).toContain("3つめ")
  })

  it("並びは DOM 上で新しい順（先頭が最新。CSS の column-reverse で視覚上は下端に出る）", () => {
    const body = buildCharacterBody({
      ...FULL_CHARACTER_DATA,
      speeches: ["1つめ", "2つめ", "3つめ"],
    })

    expect(body.indexOf("3つめ")).toBeLessThan(body.indexOf("2つめ"))
    expect(body.indexOf("2つめ")).toBeLessThan(body.indexOf("1つめ"))
  })

  it("吹き出しは立ち絵と横並びの .balloon-track に直接入る（縦を割る入れ物は置かない）", () => {
    const body = buildCharacterBody({
      ...FULL_CHARACTER_DATA,
      speeches: ["1つめ", "2つめ"],
    })

    expect(body).toContain('<div class="balloon-track">')
    // 立ち絵の直後が並びで、間に高さを割る入れ物を挟まない。
    expect(body).toMatch(/<\/div><div class="balloon-track">/)
    expect(body).not.toContain("balloon-anchor")
    expect(body).not.toContain("balloon-spacer")
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

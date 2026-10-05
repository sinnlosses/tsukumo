import { type QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Portrait,
  type PortraitProps,
  usePortraitPreload,
} from "../../../../src/browser/components/domain/portrait.tsx"
import { typedElement } from "../../../typed-element.ts"
import { createTestQueryClient } from "../../query-client.tsx"

const PLAUSIBLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'

let originalFetch: typeof globalThis.fetch
let fetchCalls: string[] = []

afterEach(() => {
  cleanup()
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch
  }
  fetchCalls = []
})

/** `fetch(url)` を、常に `text` で `body` を返す代役に差し替え、呼ばれた URL を記録する。 */
function stubFetch(body: string): void {
  originalFetch = globalThis.fetch
  const stub = (url: string): Promise<{ ok: true; text: () => Promise<string> }> => {
    fetchCalls.push(url)
    return Promise.resolve({ ok: true, text: () => Promise.resolve(body) })
  }
  // `stub` は `fetch` の実装のうち使う分（`text()` だけ返す）しか持たないので、`typeof
  // globalThis.fetch` とは構造的に合わない。`instanceof` で絞れる DOM 要素とは違い、これは
  // 迂回が要る唯一の場所（docs/coding-standards.md「型を迂回するキャストを使わない」節の
  // 「テストの DOM 要素のキャスト」）。
  // oxlint-disable-next-line typescript/consistent-type-assertions
  globalThis.fetch = stub as unknown as typeof globalThis.fetch
}

const DEFAULT_PORTRAIT: PortraitProps = {
  url: "/character/default.png",
  accent: undefined,
  altText: "架空の精霊（通常）",
  expression: "default",
  outfit: "default",
  motion: "reading",
  className: undefined,
}

// `<Portrait>` は `useQuery`（`usePortraitPreload`）を使うので `QueryClientProvider` が要る。
// キャッシュはテストをまたがせないので、テストごとに新しい `QueryClient` を作る。
function portraitTree(client: QueryClient, overrides: Partial<PortraitProps>): ReactElement {
  return (
    <QueryClientProvider client={client}>
      <Portrait {...DEFAULT_PORTRAIT} {...overrides} />
    </QueryClientProvider>
  )
}

function renderPortrait(overrides: Partial<PortraitProps>): void {
  render(portraitTree(createTestQueryClient(), overrides))
}

function portraitWrapper(): HTMLElement {
  return typedElement(document.querySelector(".portrait"), HTMLElement, "立ち絵の枠")
}

describe("Portrait", () => {
  it("SVG の URL は fetch して中身をインラインにし、同じ URL の立ち絵に戻っても fetch をやり直さない（表情の往復）", async () => {
    stubFetch(PLAUSIBLE_SVG)
    const client = createTestQueryClient()
    const defaultSvg = { url: "/character/default.svg" }
    const thinkingSvg = {
      url: "/character/thinking.svg",
      altText: "架空の精霊（作業中）",
      expression: "thinking",
    } as const

    const { rerender } = render(portraitTree(client, defaultSvg))
    await waitFor(() => {
      expect(document.querySelector(".portrait svg")).not.toBeNull()
    })

    rerender(portraitTree(client, thinkingSvg))
    await waitFor(() => {
      expect(fetchCalls).toContain("/character/thinking.svg")
    })

    rerender(portraitTree(client, defaultSvg))
    await waitFor(() => {
      expect(document.querySelector(".portrait svg")).not.toBeNull()
    })

    // default → thinking → default で、fetch は URL ごとに1回ずつだけ。
    expect(fetchCalls).toEqual(["/character/default.svg", "/character/thinking.svg"])
  })

  it("SVG の中身のスクリプト・イベントハンドラ・foreignObject・javascript: の参照は、DOM に入る前に落ちる", async () => {
    stubFetch(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="window.mark = 1"><script>window.mark = 2</script><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">偽の入力欄</div></foreignObject><use href="javascript:alert(1)"/><circle r="1" onerror="window.mark = 3"/></svg>',
    )
    renderPortrait({ url: "/character/default.svg" })

    await waitFor(() => {
      expect(document.querySelector(".portrait circle")).not.toBeNull()
    })
    const portrait = portraitWrapper()
    expect(portrait.querySelector("script, foreignObject")).toBeNull()
    expect(portrait.innerHTML).not.toMatch(/onload|onerror|javascript:|window\.mark|偽の入力欄/)
  })

  it("ラスタ画像の URL は <img> で出す（fetch しない）", () => {
    renderPortrait({})

    // `.portrait` 自身も role="img" を持つので、内側の <img class="portrait-image"> を直接見る。
    const image = document.querySelector(".portrait-image")
    expect(image?.tagName).toBe("IMG")
    expect(image?.getAttribute("src")).toBe("/character/default.png")
    expect(image?.getAttribute("alt")).toBe("架空の精霊（通常）")
    expect(fetchCalls).toEqual([])
  })

  it("差し色を CSS 変数 --outfit-accent として当てる", () => {
    renderPortrait({ accent: "#b8c7ff", outfit: "normal" })

    expect(portraitWrapper().style.getPropertyValue("--outfit-accent")).toBe("#b8c7ff")
  })

  it("差し色が無いときは style 属性ごと省略する", () => {
    renderPortrait({})

    expect(portraitWrapper().getAttribute("style")).toBeNull()
  })

  it("motion をそのまま data-motion 属性へ渡す（CSS 側が動きを選ぶ手がかり）", () => {
    renderPortrait({ motion: "waiting" })

    expect(portraitWrapper().getAttribute("data-motion")).toBe("waiting")
  })
})

/** `usePortraitPreload` を呼ぶだけの部品（フックを部品の中で呼ぶため）。 */
function Preload(props: { readonly portraits: Readonly<Record<string, string>> }): null {
  usePortraitPreload(props.portraits)
  return null
}

describe("usePortraitPreload", () => {
  it("SVG の立ち絵を先に読み、あとからマウントした立ち絵は読み終わった絵で描き始める", async () => {
    stubFetch(PLAUSIBLE_SVG)
    const client = createTestQueryClient()
    const portraits = {
      default: "/character/default.svg",
      proud: "/character/proud.svg",
      // 立ち絵を持たない表情は `default` の絵に畳まれて届く（同じ URL は1回だけ読む）。
      thinking: "/character/default.svg",
    }
    render(
      <QueryClientProvider client={client}>
        <Preload portraits={portraits} />
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(client.getQueryData<string>(["/character/proud.svg"])).toBe(PLAUSIBLE_SVG)
    })

    // 仕事 / 雑談を切り替えたときの新しいマウント。最初の描画から絵がある（空かない）。
    render(
      portraitTree(client, {
        url: "/character/proud.svg",
        altText: "架空の精霊（得意げ）",
        expression: "proud",
      }),
    )
    expect(document.querySelector(".portrait svg")).not.toBeNull()
    expect(fetchCalls.toSorted()).toEqual(["/character/default.svg", "/character/proud.svg"])
  })

  it("ラスタの立ち絵は `Image` に読ませ、外れたら読み込みを打ち切る", () => {
    const images: { src: string }[] = []
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: class {
        src = ""
        constructor() {
          images.push(this)
        }
      },
    })
    const client = createTestQueryClient()

    const { unmount } = render(
      <QueryClientProvider client={client}>
        <Preload portraits={{ default: "/character/default.png", proud: "/character/proud.png" }} />
      </QueryClientProvider>,
    )
    expect(images.map((image) => image.src)).toEqual([
      "/character/default.png",
      "/character/proud.png",
    ])
    expect(fetchCalls).toEqual([])

    unmount()
    expect(images.map((image) => image.src)).toEqual(["", ""])
    Reflect.deleteProperty(globalThis, "Image")
  })
})

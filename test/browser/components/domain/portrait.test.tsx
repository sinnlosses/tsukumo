import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, waitFor } from "@testing-library/react"

import {
  Portrait,
  usePortraitPreload,
} from "../../../../src/browser/components/domain/portrait.tsx"
import { typedElement } from "../../../typed-element.ts"

// フィクスチャはすべて手で書いた架空の SVG・URL（docs/coding-standards.md「会話内容の扱い」）。

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

// `<Portrait>` は `useQuery`（`components/domain/portrait.tsx`）を使うので `QueryClientProvider` が要る
// （`test/browser/` の他の部品テストが Context の Provider で包むのと同じ形）。**キャッシュはテストを
// またがせない**ので、テストごとに新しい `QueryClient` を作る。

describe("Portrait", () => {
  it("SVG の URL は fetch して中身をそのままインラインにする", async () => {
    stubFetch(PLAUSIBLE_SVG)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <Portrait
          url="/character/default.svg"
          accent={undefined}
          altText="架空の精霊（通常）"
          expression="default"
          outfit="default"
          motion="reading"
          className={undefined}
        />
      </QueryClientProvider>,
    )

    await waitFor(() => {
      expect(document.querySelector(".portrait svg")).not.toBeNull()
    })
  })

  it("同じ URL の立ち絵に戻っても fetch をやり直さない（表情の往復）", async () => {
    stubFetch(PLAUSIBLE_SVG)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { rerender } = render(
      <QueryClientProvider client={client}>
        <Portrait
          url="/character/default.svg"
          accent={undefined}
          altText="架空の精霊（通常）"
          expression="default"
          outfit="default"
          motion="reading"
          className={undefined}
        />
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(document.querySelector(".portrait svg")).not.toBeNull()
    })

    rerender(
      <QueryClientProvider client={client}>
        <Portrait
          url="/character/thinking.svg"
          accent={undefined}
          altText="架空の精霊（作業中）"
          expression="thinking"
          outfit="default"
          motion="reading"
          className={undefined}
        />
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(fetchCalls).toContain("/character/thinking.svg")
    })

    rerender(
      <QueryClientProvider client={client}>
        <Portrait
          url="/character/default.svg"
          accent={undefined}
          altText="架空の精霊（通常）"
          expression="default"
          outfit="default"
          motion="reading"
          className={undefined}
        />
      </QueryClientProvider>,
    )
    await waitFor(() => {
      expect(document.querySelector(".portrait svg")).not.toBeNull()
    })

    // default → thinking → default で、fetch は URL ごとに1回ずつだけ。
    expect(fetchCalls).toEqual(["/character/default.svg", "/character/thinking.svg"])
  })

  it("ラスタ画像の URL は <img> で出す（fetch しない）", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <Portrait
          url="/character/default.png"
          accent={undefined}
          altText="架空の精霊（通常）"
          expression="default"
          outfit="default"
          motion="reading"
          className={undefined}
        />
      </QueryClientProvider>,
    )

    // `.portrait` 自身も role="img" を持つので、内側の <img class="portrait-image"> を直接見る。
    const image = document.querySelector(".portrait-image")
    expect(image?.tagName).toBe("IMG")
    expect(image?.getAttribute("src")).toBe("/character/default.png")
    expect(image?.getAttribute("alt")).toBe("架空の精霊（通常）")
    expect(fetchCalls).toEqual([])
  })

  it("(5) 差し色を CSS 変数 --outfit-accent として当てる", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <Portrait
          url="/character/default.png"
          accent="#b8c7ff"
          altText="架空の精霊（通常）"
          expression="default"
          outfit="normal"
          motion="reading"
          className={undefined}
        />
      </QueryClientProvider>,
    )

    const wrapper = typedElement(document.querySelector(".portrait"), HTMLElement, "立ち絵の枠")
    expect(wrapper.style.getPropertyValue("--outfit-accent")).toBe("#b8c7ff")
  })

  it("差し色が無いときは style 属性ごと省略する", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <Portrait
          url="/character/default.png"
          accent={undefined}
          altText="架空の精霊（通常）"
          expression="default"
          outfit="default"
          motion="reading"
          className={undefined}
        />
      </QueryClientProvider>,
    )

    const wrapper = typedElement(document.querySelector(".portrait"), HTMLElement, "立ち絵の枠")
    expect(wrapper.getAttribute("style")).toBeNull()
  })

  it("motion をそのまま data-motion 属性へ渡す（CSS 側が動きを選ぶ手がかり）", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <Portrait
          url="/character/default.png"
          accent={undefined}
          altText="架空の精霊（通常）"
          expression="default"
          outfit="default"
          motion="waiting"
          className={undefined}
        />
      </QueryClientProvider>,
    )

    const wrapper = typedElement(document.querySelector(".portrait"), HTMLElement, "立ち絵の枠")
    expect(wrapper.getAttribute("data-motion")).toBe("waiting")
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
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

    // 仕事 / 雑談を切り替えたときの新しいマウント。**最初の描画から絵がある**（空かない）。
    render(
      <QueryClientProvider client={client}>
        <Portrait
          url="/character/proud.svg"
          accent={undefined}
          altText="架空の精霊（得意げ）"
          expression="proud"
          outfit="default"
          motion="reading"
          className={undefined}
        />
      </QueryClientProvider>,
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
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

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

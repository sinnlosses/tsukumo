import { afterEach, describe, expect, it } from "bun:test"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, render, waitFor } from "@testing-library/react"

import { Portrait } from "../../../src/browser/components/portrait.tsx"

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
  globalThis.fetch = stub as unknown as typeof globalThis.fetch
}

// `<Portrait>` は `useQuery`（`components/portrait.tsx`）を使うので `QueryClientProvider` が要る
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

    const wrapper = document.querySelector(".portrait") as HTMLElement
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

    const wrapper = document.querySelector(".portrait") as HTMLElement
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

    const wrapper = document.querySelector(".portrait") as HTMLElement
    expect(wrapper.getAttribute("data-motion")).toBe("waiting")
  })
})

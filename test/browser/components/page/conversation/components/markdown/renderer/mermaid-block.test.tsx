import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MermaidBlock as MermaidBlockComponent } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/mermaid-block.tsx"
import { stubIntersectionObserver } from "../../../../../../../fixture/intersection.ts"

// jsdom には canvas が無く、色のトークンも解けない。
vi.mock(
  "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/theme-color.ts",
  () => ({
    resolveColor: () => "rgb(0, 0, 0)",
    resolveHex: () => "#000000",
  }),
)

const scripts: Node[] = []

const initialize = vi.fn<() => void>()
const renderDiagram =
  vi.fn<(id: string, code: string) => Promise<{ svg: string; bindFunctions: undefined }>>()

let MermaidBlock: typeof MermaidBlockComponent

beforeEach(async () => {
  stubIntersectionObserver(true)
  vi.resetModules()
  ;({ MermaidBlock } =
    await import("../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/mermaid-block.tsx"))
  scripts.length = 0
  initialize.mockClear()
  renderDiagram.mockReset()
  renderDiagram.mockImplementation((id: string, code: string) =>
    Promise.resolve({
      svg: `<svg id="${id}"><g marker-end="url(#${id}_arrow)"></g><text>${code}</text></svg>`,
      bindFunctions: undefined,
    }),
  )
  vi.stubGlobal("mermaid", { initialize, render: renderDiagram })
  // jsdom は <script> を読まないので、足された script の読み込み完了はテストが送る。
  vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
    if (node.nodeName === "SCRIPT") {
      scripts.push(node)
    }
    return node
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// 図を描く順番待ちが1つ進んでから `<script>` が足されるので、足されるのを待ってから読み込み完了を送る。
async function finishLoading(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
  for (const script of scripts) {
    script.dispatchEvent(new Event("load"))
  }
}

describe("MermaidBlock の描いた SVG の使い回し", () => {
  it("同じソースを開き直しても、描き直さず初期化もやり直さない", async () => {
    const first = render(<MermaidBlock code="graph A1" />)
    await finishLoading()
    await waitFor(() => {
      expect(first.container.querySelector("svg")).not.toBeNull()
    })
    first.unmount()
    const second = render(<MermaidBlock code="graph A1" />)

    expect(second.container.querySelector("pre.mermaid svg")).not.toBeNull()
    expect(second.container.querySelector("pre")?.getAttribute("data-processed")).toBe("true")
    expect(renderDiagram).toHaveBeenCalledTimes(1)
    expect(initialize).toHaveBeenCalledTimes(1)
  })

  it("同じ図が2つ並んでも、描くのは1回で SVG の中の id の参照は自分の id を指す", async () => {
    const view = render(
      <>
        <MermaidBlock code="graph B1" />
        <MermaidBlock code="graph B1" />
      </>,
    )
    await finishLoading()
    await waitFor(() => {
      expect(view.container.querySelectorAll("svg")).toHaveLength(2)
    })

    expect(renderDiagram).toHaveBeenCalledTimes(1)
    const svgs = [...view.container.querySelectorAll("svg")]
    const ids = svgs.map((svg) => svg.id)
    expect(new Set(ids).size).toBe(2)
    for (const svg of svgs) {
      expect(svg.querySelector("g")?.getAttribute("marker-end")).toBe(`url(#${svg.id}_arrow)`)
      for (const other of ids.filter((id) => id !== svg.id)) {
        expect(svg.outerHTML).not.toContain(other)
      }
    }
  })

  it("違うソースは別々に描くが、初期化は1回のまま", async () => {
    const view = render(
      <>
        <MermaidBlock code="graph C1" />
        <MermaidBlock code="graph C2" />
      </>,
    )
    await finishLoading()
    await waitFor(() => {
      expect(view.container.querySelectorAll("svg")).toHaveLength(2)
    })

    expect(renderDiagram).toHaveBeenCalledTimes(2)
    expect(initialize.mock.calls.length).toBeLessThanOrEqual(1)
  })

  it("描けなかったソースは覚えず、次のマウントでもう一度描く", async () => {
    renderDiagram.mockRejectedValueOnce(new Error("構文エラー"))
    const first = render(<MermaidBlock code="graph D1" />)
    await finishLoading()
    await waitFor(() => {
      expect(first.container.querySelector(".mermaid-broken")).not.toBeNull()
    })
    first.unmount()

    const second = render(<MermaidBlock code="graph D1" />)
    await waitFor(() => {
      expect(second.container.querySelector("svg")).not.toBeNull()
    })

    expect(renderDiagram).toHaveBeenCalledTimes(2)
  })
})

describe("MermaidBlock の幅の段", () => {
  // jsdom は配置しないので、描いた幅を `<pre>` の段とソース（TD か LR か）から決めて返す。
  function stubDrawnWidth(
    widthOf: (measure: string | undefined, topDown: boolean) => number,
  ): void {
    renderDiagram.mockImplementation((id: string, code: string) =>
      Promise.resolve({
        svg: `<svg id="${id}" viewBox="0 0 1000 400"><text>${code}</text></svg>`,
        bindFunctions: undefined,
      }),
    )
    vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockImplementation(function (
      this: SVGElement,
    ) {
      const width = widthOf(
        this.closest("pre")?.getAttribute("data-measure") ?? undefined,
        (this.textContent ?? "").startsWith("flowchart TD"),
      )
      return new DOMRect(0, 0, width, width * 0.4)
    })
  }

  async function drawn(code: string): Promise<HTMLElement> {
    const view = render(<MermaidBlock code={code} />)
    await finishLoading()
    await waitFor(() => {
      expect(view.container.querySelector("pre.mermaid svg")).not.toBeNull()
    })
    const pre = view.container.querySelector<HTMLElement>("pre.mermaid")
    if (pre === null) {
      throw new Error("pre.mermaid が無い")
    }
    return pre
  }

  it("本文の列で 12px 以上なら body のまま、1回だけ描く", async () => {
    stubDrawnWidth(() => 750)
    const pre = await drawn("flowchart LR\n  A1 --> B1")
    expect(pre.dataset["measure"]).toBe("body")
    expect(renderDiagram).toHaveBeenCalledTimes(1)
  })

  it("本文の列で足りず 63em で足りるなら wide にする", async () => {
    stubDrawnWidth((measure) => (measure === "body" ? 600 : 800))
    const pre = await drawn("flowchart LR\n  A2 --> B2")
    expect(pre.dataset["measure"]).toBe("wide")
    expect(renderDiagram).toHaveBeenCalledTimes(1)
  })

  it("LR がどの段でも足りないとき TD で描き直し、TD で足りる段にする", async () => {
    stubDrawnWidth((_, topDown) => (topDown ? 900 : 300))
    const pre = await drawn("flowchart LR\n  A3 --> B3")
    expect(renderDiagram).toHaveBeenCalledTimes(2)
    expect(renderDiagram.mock.calls[1]?.[1]).toBe("flowchart TD\n  A3 --> B3")
    expect(pre.dataset["measure"]).toBe("body")
    expect(pre.style.getPropertyValue("--natural-width")).toBe("")
  })

  it("TD でも足りず、自然幅が本文の列の内幅を超えるときは自然幅で描いて横に転がす", async () => {
    stubDrawnWidth(() => 300)
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(630)
    const pre = await drawn("flowchart LR\n  A4 --> B4")
    expect(renderDiagram).toHaveBeenCalledTimes(2)
    expect(pre.dataset["measure"]).toBe("scroll")
    expect(pre.style.getPropertyValue("--natural-width")).toBe("1000px")
  })

  it("足りなくても自然幅が本文の列の内幅に収まるなら、段を上げず自然寸法で描く", async () => {
    stubDrawnWidth(() => 300)
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(1200)
    const pre = await drawn("flowchart LR\n  A7 --> B7")
    expect(pre.dataset["measure"]).toBe("natural")
    expect(pre.style.getPropertyValue("--natural-width")).toBe("1000px")
  })

  it("LR でない図は描き直さず、足りなければ自然寸法で描く", async () => {
    stubDrawnWidth(() => 300)
    const pre = await drawn("sequenceDiagram\n  A5->>B5: x")
    expect(renderDiagram).toHaveBeenCalledTimes(1)
    expect(["scroll", "natural"]).toContain(pre.dataset["measure"])
  })

  it("LR を描き終えたところで取り消されても、覚えた LR を次に差すときは TD にする", async () => {
    stubDrawnWidth((_, topDown) => (topDown ? 900 : 300))
    const code = "flowchart LR\n  A8 --> B8"
    let finish: () => void = () => undefined
    renderDiagram.mockImplementationOnce(
      (id: string, source: string) =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              svg: `<svg id="${id}" viewBox="0 0 1000 400"><text>${source}</text></svg>`,
              bindFunctions: undefined,
            })
        }),
    )
    const first = render(<MermaidBlock code={code} />)
    await finishLoading()
    await waitFor(() => {
      expect(renderDiagram).toHaveBeenCalledTimes(1)
    })
    first.unmount()
    await act(async () => {
      finish()
      await Promise.resolve()
    })

    const pre = await drawn(code)
    await waitFor(() => {
      expect(pre.dataset["measure"]).toBe("body")
    })
    expect(renderDiagram.mock.calls.at(-1)?.[1]).toBe("flowchart TD\n  A8 --> B8")
  })

  it("側で覚えた LR を本体で差すときも、足りなければ TD にする", async () => {
    stubDrawnWidth((_, topDown) => (topDown ? 900 : 300))
    const code = "flowchart LR\n  A9 --> B9"
    const side = document.createElement("div")
    side.className = "report-before-after-side"
    document.body.append(side)
    const sideView = render(<MermaidBlock code={code} />, { container: side })
    await finishLoading()
    await waitFor(() => {
      expect(sideView.container.querySelector("pre.mermaid svg")).not.toBeNull()
    })
    sideView.unmount()
    side.remove()
    expect(renderDiagram).toHaveBeenCalledTimes(1)

    const pre = await drawn(code)
    await waitFor(() => {
      expect(pre.dataset["measure"]).toBe("body")
    })
    expect(renderDiagram).toHaveBeenCalledTimes(2)
    expect(renderDiagram.mock.calls[1]?.[1]).toBe("flowchart TD\n  A9 --> B9")
  })

  it("TD も覚えていれば、3 回目は描かずに差す", async () => {
    stubDrawnWidth((_, topDown) => (topDown ? 900 : 300))
    const code = "flowchart LR\n  A10 --> B10"
    const first = await drawn(code)
    await waitFor(() => {
      expect(first.dataset["measure"]).toBe("body")
    })
    cleanup()
    const second = await drawn(code)
    await waitFor(() => {
      expect(second.dataset["measure"]).toBe("body")
    })
    expect(renderDiagram).toHaveBeenCalledTimes(2)
  })

  it("前後の塊の側の図には段を当てない", async () => {
    stubDrawnWidth(() => 300)
    const side = document.createElement("div")
    side.className = "report-before-after-side"
    document.body.append(side)
    const view = render(<MermaidBlock code={"flowchart LR\n  A6 --> B6"} />, { container: side })
    await finishLoading()
    await waitFor(() => {
      expect(view.container.querySelector("pre.mermaid svg")).not.toBeNull()
    })
    expect(renderDiagram).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector("pre.mermaid")?.hasAttribute("data-measure")).toBe(false)
    side.remove()
  })
})

describe("MermaidBlock の見えてから描く", () => {
  it("見えるまでは描画を始めず、手すきまで読み込みも待ち、ソースの字なしの高さのある枠を出す", async () => {
    const idle: (() => void)[] = []
    vi.stubGlobal("requestIdleCallback", (callback: () => void) => idle.push(callback))
    const intersection = stubIntersectionObserver(false)
    const view = render(<MermaidBlock code={"graph A\nA --> B\nB --> C"} />)
    await finishLoading()

    const pre = view.container.querySelector("pre.mermaid")
    expect(scripts).toHaveLength(0)
    expect(renderDiagram).not.toHaveBeenCalled()
    expect(pre?.getAttribute("data-pending")).toBe("unseen")
    expect(pre?.textContent).toBe("")
    expect(pre instanceof HTMLElement && pre.style.getPropertyValue("--frame-height")).toBe("268px")

    act(() => {
      for (const callback of idle) {
        callback()
      }
    })
    expect(scripts).toHaveLength(1)
    expect(renderDiagram).not.toHaveBeenCalled()

    act(() => {
      intersection.intersect()
    })
    await finishLoading()
    await waitFor(() => {
      expect(view.container.querySelector("pre.mermaid svg")).not.toBeNull()
    })
    expect(view.container.querySelector("pre.mermaid")?.hasAttribute("data-pending")).toBe(false)
  })
})

describe("MermaidBlock の拡大", () => {
  it("描く前に押しても開かず、描き終えたあとに押すと拡大の面が開く", async () => {
    const view = render(<MermaidBlock code="graph Z1" />)
    const pre = view.container.querySelector("pre.mermaid")
    expect(pre?.getAttribute("role")).toBe("button")

    fireEvent.click(pre ?? view.container)
    expect(document.querySelector("dialog.image-zoom")).toBeNull()

    await finishLoading()
    await waitFor(() => {
      expect(view.container.querySelector("pre.mermaid svg")).not.toBeNull()
    })
    fireEvent.click(pre ?? view.container)

    expect(document.querySelector("dialog.image-zoom img")?.getAttribute("src")).toContain(
      "data:image/svg+xml",
    )
  })
})

describe("MermaidBlock のソースの色のトークン", () => {
  it("var(--…) を hex に置き換えてから描く", async () => {
    render(<MermaidBlock code={"graph T1\n  classDef a stroke:var(--state-ok),fill:var(--ink)"} />)
    await finishLoading()
    await waitFor(() => {
      expect(renderDiagram).toHaveBeenCalledTimes(1)
    })

    expect(renderDiagram.mock.calls[0]?.[1]).toBe(
      "graph T1\n  classDef a stroke:#000000,fill:#000000",
    )
  })
})

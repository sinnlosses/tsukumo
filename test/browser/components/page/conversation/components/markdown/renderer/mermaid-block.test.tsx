import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { MermaidBlock as MermaidBlockComponent } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/mermaid-block.tsx"

// jsdom には canvas が無く、色のトークンも解けない。
vi.mock(
  "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/theme-color.ts",
  () => ({
    resolveColor: () => "rgb(0, 0, 0)",
    resolveHex: () => "#000000",
  }),
)

const scripts: Node[] = []

const initialize = vi.fn()
const renderDiagram = vi.fn()

let MermaidBlock: typeof MermaidBlockComponent

beforeEach(async () => {
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

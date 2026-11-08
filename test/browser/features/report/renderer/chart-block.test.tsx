import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { createRef, type Ref } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartBlock } from "../../../../../src/browser/features/report/renderer/chart-block.tsx"
import type { ChartTooltipControl } from "../../../../../src/browser/features/report/renderer/chart-tooltip.ts"
import { FenceFigure } from "../../../../../src/browser/features/report/renderer/fence-figure.tsx"
import { stubIntersectionObserver } from "../../../../fixture/intersection.ts"

// jsdom には canvas が無く、色のトークンも解けない。
vi.mock("../../../../../src/browser/features/report/renderer/theme-color.ts", () => ({
  resolveColor: () => "rgb(0, 0, 0)",
  resolveColorMix: () => "rgb(0, 0, 0)",
  resolveHex: () => "#000000",
  resolveHexOver: () => "#000000",
}))

const SPEC_A = '{"type":"bar","data":{}}'
const SPEC_B = '{"type":"line","data":{}}'

const SPEC_ITEMS =
  '{"type":"bar","data":{"labels":["A","B"],"datasets":[{"label":"x","data":[1,2]},{"label":"y","data":[3,4]}]}}'

type Instance = {
  readonly destroy: ReturnType<typeof vi.fn>
  readonly setActiveElements: ReturnType<typeof vi.fn>
  readonly update: ReturnType<typeof vi.fn>
}

const instances: Instance[] = []
const activeCalls: unknown[] = []
const scripts: Node[] = []

class FakeChart implements Instance {
  static readonly defaults = {
    color: "",
    maintainAspectRatio: true,
    font: { family: "" },
    scale: { grid: { color: "", display: true }, border: { color: "" }, ticks: { color: "" } },
    plugins: { colors: { enabled: true }, legend: { display: true } },
    set: vi.fn<() => void>(),
  }
  static readonly register = vi.fn<() => void>()
  readonly destroy = vi.fn<() => void>()
  readonly data: { labels?: unknown[]; datasets: { label?: string; data: unknown[] }[] }
  readonly tooltip = { setActiveElements: vi.fn<(active: unknown, position: unknown) => void>() }
  readonly setActiveElements = vi.fn<(active: unknown) => void>((active) => {
    activeCalls.push(active)
  })
  readonly update = vi.fn<() => void>()

  constructor(_canvas?: unknown, config?: { data?: FakeChart["data"] }) {
    this.data = config?.data ?? { datasets: [] }
    instances.push(this)
  }
}

beforeEach(() => {
  stubIntersectionObserver(true)
  instances.length = 0
  activeCalls.length = 0
  scripts.length = 0
  vi.stubGlobal("Chart", FakeChart)
  // jsdom は <script> を読まないので、足された script の読み込み完了はテストが送る。
  // 読み込みの Promise は最初の1回だけ作られ、以降は解決済みのものが返る。
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

function finishLoading(): void {
  for (const script of scripts) {
    script.dispatchEvent(new Event("load"))
  }
}

describe("ChartBlock の見えてから描く", () => {
  it("見えるまでは読み込みも生成も始めず、見えたら描く", async () => {
    const intersection = stubIntersectionObserver(false)
    render(<ChartBlock spec={SPEC_A} />)
    finishLoading()

    expect(scripts).toHaveLength(0)
    expect(instances).toHaveLength(0)

    act(() => {
      intersection.intersect()
    })
    finishLoading()
    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })
  })
})

describe("ChartBlock の入れ物", () => {
  it("spec の tsukumo.height を入れ物の高さにし、Chart.js へ渡す設定からは外す", async () => {
    const created: unknown[] = []
    vi.stubGlobal(
      "Chart",
      class extends FakeChart {
        constructor(canvas: unknown, config: { data?: FakeChart["data"] }) {
          super(canvas, config)
          created.push(config)
        }
      },
    )
    const view = render(<ChartBlock spec='{"type":"bar","tsukumo":{"height":356}}' />)
    finishLoading()
    await waitFor(() => {
      expect(created).toHaveLength(1)
    })

    const block = view.container.querySelector<HTMLElement>(".chart-block")
    expect(block?.style.height).toBe("356px")
    expect(created[0]).toEqual({ type: "bar" })
  })

  it("目印の chart-block を持ち、高さが無ければ style を付けない", () => {
    const view = render(<ChartBlock spec={SPEC_A} />)

    const block = view.container.firstElementChild
    expect(block?.classList.contains("chart-block")).toBe(true)
    expect(block?.getAttribute("style")).toBeNull()
  })
})

describe("ChartBlock の後片付け", () => {
  it("アンマウントで、作ったインスタンスが1回だけ破棄される", async () => {
    const view = render(<ChartBlock spec={SPEC_A} />)
    finishLoading()
    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })
    expect(instances[0]?.destroy).toHaveBeenCalledTimes(0)

    view.unmount()

    expect(instances[0]?.destroy).toHaveBeenCalledTimes(1)
  })

  it("spec が変わると前のインスタンスだけが破棄され、破棄の数は作った数に揃う", async () => {
    const view = render(<ChartBlock spec={SPEC_A} />)
    finishLoading()
    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })

    view.rerender(<ChartBlock spec={SPEC_B} />)
    await waitFor(() => {
      expect(instances).toHaveLength(2)
    })
    expect(instances[0]?.destroy).toHaveBeenCalledTimes(1)
    expect(instances[1]?.destroy).toHaveBeenCalledTimes(0)

    view.unmount()

    expect(instances.map((instance) => instance.destroy.mock.calls.length)).toEqual([1, 1])
  })

  it("読み込みの完了より先にアンマウントされたら、インスタンスを作らない", async () => {
    const view = render(<ChartBlock spec={SPEC_A} />)

    view.unmount()
    finishLoading()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(instances).toHaveLength(0)
  })

  it("JSON が壊れていると failed の表示になり、インスタンスは作られない", async () => {
    const view = render(<ChartBlock spec="{" />)
    finishLoading()

    await waitFor(() => {
      expect(view.container.querySelector("[data-chart-failed='yes']")).not.toBeNull()
    })
    expect(instances).toHaveLength(0)
  })
})

describe("FenceFigure 経由の controlRef", () => {
  it("chart のフェンスでも controlRef から札を頼める", async () => {
    const control = createRef<ChartTooltipControl>()
    render(<FenceFigure language="chart" spec={SPEC_ITEMS} controlRef={control} />)
    finishLoading()
    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })

    act(() => {
      control.current?.show(0)
    })

    expect(activeCalls.at(-1)).toEqual([
      { datasetIndex: 0, index: 0 },
      { datasetIndex: 1, index: 0 },
    ])
  })
})

describe("ChartBlock のキーボード操作", () => {
  async function renderItems(controlRef?: Ref<ChartTooltipControl>) {
    const view = render(<ChartBlock spec={SPEC_ITEMS} controlRef={controlRef} />)
    finishLoading()
    await waitFor(() => {
      expect(instances).toHaveLength(1)
    })
    const block = view.container.querySelector<HTMLElement>(".chart-block")
    if (block === null) {
      throw new Error("chart-block が無い")
    }
    return { block, view }
  }

  const lastActive = () => activeCalls.at(-1)

  function press(target: HTMLElement, event: string): void {
    if (event === "blur") {
      fireEvent.blur(target)
    } else {
      fireEvent.keyDown(target, { key: event })
    }
  }

  it("入れ物に tabIndex と aria-label が付く", async () => {
    const { block } = await renderItems()

    expect(block.tabIndex).toBe(0)
    expect(block.getAttribute("aria-label")).toContain("矢印")
  })

  it("ArrowRight で 0 番目の札が出て、続けて 1 番目へ移る", async () => {
    const { block } = await renderItems()

    press(block, "ArrowRight")
    expect(lastActive()).toEqual([
      { datasetIndex: 0, index: 0 },
      { datasetIndex: 1, index: 0 },
    ])
    press(block, "ArrowRight")
    expect(lastActive()).toEqual([
      { datasetIndex: 0, index: 1 },
      { datasetIndex: 1, index: 1 },
    ])
  })

  it("Escape と blur で札を消す", async () => {
    const { block } = await renderItems()

    press(block, "ArrowRight")
    press(block, "Escape")
    expect(lastActive()).toEqual([])

    press(block, "ArrowRight")
    press(block, "blur")
    expect(lastActive()).toEqual([])
  })

  it("読み上げの領域に札と同じ字が入る", async () => {
    const { block } = await renderItems()

    press(block, "ArrowRight")

    expect(block.querySelector("[role='status']")?.textContent).toBe("A\nx 1\ny 3")
  })

  it("controlRef から頼むと同じ札が出る", async () => {
    const control = createRef<ChartTooltipControl>()
    const { block } = await renderItems(control)

    act(() => {
      control.current?.show(1)
    })

    expect(lastActive()).toEqual([
      { datasetIndex: 0, index: 1 },
      { datasetIndex: 1, index: 1 },
    ])
    expect(block.querySelector("[role='status']")?.textContent).toBe("B\nx 2\ny 4")
  })
})

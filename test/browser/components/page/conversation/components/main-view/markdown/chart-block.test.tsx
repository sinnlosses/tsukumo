import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ChartBlock } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/markdown/chart-block.tsx"

const SPEC_A = '{"type":"bar","data":{}}'
const SPEC_B = '{"type":"line","data":{}}'

type Instance = { readonly destroy: ReturnType<typeof vi.fn> }

const instances: Instance[] = []
const scripts: Node[] = []

class FakeChart implements Instance {
  static readonly defaults = {
    color: "",
    maintainAspectRatio: true,
    scale: { grid: { color: "" }, border: { color: "" } },
  }
  readonly destroy = vi.fn()

  constructor() {
    instances.push(this)
  }
}

beforeEach(() => {
  instances.length = 0
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

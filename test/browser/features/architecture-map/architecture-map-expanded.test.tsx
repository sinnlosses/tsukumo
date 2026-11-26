import { QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ArchitectureMapExpanded } from "../../../../src/browser/features/architecture-map/architecture-map-expanded.tsx"
import { useArchitectureMapSelection } from "../../../../src/browser/features/architecture-map/architecture-map-selection.ts"
import type { MapView, MapViewBox } from "../../../../src/shared/architecture-map/map-view.ts"
import { createTestQueryClient } from "../../query-client.tsx"
import { rpcOutput, stubRpcFetch, type RpcFetchStub } from "../../rpc-fetch-stub.ts"

let fetchStub: RpcFetchStub | undefined = undefined

afterEach(() => {
  cleanup()
  fetchStub?.restore()
  fetchStub = undefined
  useArchitectureMapSelection.setState({
    selected: undefined,
    lit: undefined,
    expanded: false,
    badge: undefined,
    sidebarTab: "tasks",
    unseenPointCount: 0,
  })
})

function box(id: string, overrides: Partial<MapViewBox> = {}): MapViewBox {
  return {
    id,
    title: id,
    level: 1,
    external: false,
    hasChildren: false,
    paths: [],
    problems: [],
    ...overrides,
  }
}

const WHOLE: MapView = {
  level: 1,
  boxes: [
    box("alpha", { title: "アルファ", summary: "架空の受け持ち", hasChildren: true }),
    box("beta", { title: "ベータ", summary: "別の受け持ち" }),
  ],
  edges: [{ from: "alpha", to: "beta", count: 4, undeclared: false }],
  intendedEdges: [],
  closedCount: 0,
  findings: [],
}

const INSIDE: MapView = {
  level: 2,
  focus: { id: "alpha", title: "アルファ", level: 1 },
  boxes: [box("alpha/one", { title: "内側の箱", level: 2 })],
  edges: [],
  intendedEdges: [],
  closedCount: 0,
  findings: [],
}

const LANED: MapView = {
  ...WHOLE,
  lanes: [
    { id: "front", title: "前", kind: "runtime" },
    { id: "back", title: "後ろ", kind: "runtime" },
    { id: "outer", title: "外部", kind: "external" },
  ],
  boxes: [
    box("alpha", {
      title: "アルファ",
      summary: "架空の受け持ち",
      hasChildren: true,
      lane: "front",
    }),
    box("beta", { title: "ベータ", summary: "別の受け持ち", lane: "back" }),
    box("gamma", { title: "ガンマ", external: true, lane: "outer" }),
  ],
}

function renderExpanded(whole: MapView = WHOLE): void {
  fetchStub = stubRpcFetch((call) => {
    if (call.procedure === "architectureMap/boxes") {
      return rpcOutput({ kind: "ready", boxes: [] })
    }
    const input: unknown = call.input
    const focus = typeof input === "object" && input !== null && "box" in input
    return rpcOutput({
      kind: "ready",
      source: { producer: "架空 0.0.1", commit: "abc" },
      ...(focus ? {} : { overview: "架空の概要" }),
      view: focus ? INSIDE : whole,
    })
  })
  useArchitectureMapSelection.setState({ expanded: true })
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ArchitectureMapExpanded />
    </QueryClientProvider>,
  )
}

function scale(): number {
  return Number(screen.getByTestId("architecture-map-diagram").parentElement?.dataset["scale"])
}

describe("ArchitectureMapExpanded", () => {
  it("全体の図に箱の summary と凡例の問いと、矢印の数の注記が出る", async () => {
    renderExpanded()

    expect(await screen.findByText("架空の受け持ち")).toBeTruthy()
    expect(screen.getByText(/このリポジトリは何で/)).toBeTruthy()
    expect(screen.getByText("矢印の数は import の本数")).toBeTruthy()
    expect(screen.getByText("4")).toBeTruthy()
  })

  it("子を持つ箱を押すと潜ってパンくずが伸び、パンくずで戻れる。子を持たない箱は選ぶだけ", async () => {
    renderExpanded()

    fireEvent.click(await screen.findByRole("button", { name: "ベータ" }))
    expect(useArchitectureMapSelection.getState().selected?.box.id).toBe("beta")
    expect(
      within(screen.getByRole("navigation", { name: "地図の段" })).getAllByRole("listitem"),
    ).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "アルファ" }))
    expect(await screen.findByRole("button", { name: "内側の箱" })).toBeTruthy()
    expect(screen.getByText(/この機能は何を受け持ち/)).toBeTruthy()
    expect(fetchStub?.calls().some((call) => JSON.stringify(call.input).includes("alpha"))).toBe(
      true,
    )

    fireEvent.click(screen.getByRole("button", { name: "全体" }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ベータ" })).toBeTruthy()
    })
  })

  it("会話で全体の図に無い箱を指されると、段が「全体 › 親の図」に替わり、触れている箱が光る", async () => {
    renderExpanded()
    await screen.findByRole("button", { name: "ベータ" })
    const inner = INSIDE.boxes[0]
    if (inner === undefined) {
      throw new Error("内側の箱が無い")
    }

    act(() => {
      useArchitectureMapSelection.getState().pointBox(inner, INSIDE)
      useArchitectureMapSelection.getState().setLit(inner.id)
    })

    const node = await screen.findByRole("button", { name: "内側の箱" })
    expect(node.getAttribute("data-lit")).toBe("true")
    expect(screen.getByRole("navigation", { name: "地図の段" }).textContent).toContain("アルファ")
  })

  it("潜った先で焦点の箱のバッジに触れると、親の図に一時的に替わってその箱が光る", async () => {
    renderExpanded()
    fireEvent.click(await screen.findByRole("button", { name: "アルファ" }))
    await screen.findByRole("button", { name: "内側の箱" })

    act(() => {
      useArchitectureMapSelection.getState().setLit("alpha")
      useArchitectureMapSelection.getState().setLitView("alpha", WHOLE)
    })

    const diagram = await screen.findByTestId("architecture-map-diagram")
    const node = await within(diagram).findByRole("button", { name: "アルファ" })
    expect(node.getAttribute("data-lit")).toBe("true")
  })

  it("箱を選ぶと横に「この箱について聞く」が出て、押すとバッジが付く", async () => {
    renderExpanded()
    expect(screen.queryByRole("button", { name: "この箱について聞く" })).toBeNull()

    fireEvent.click(await screen.findByRole("button", { name: "ベータ" }))
    fireEvent.click(screen.getByRole("button", { name: "この箱について聞く" }))

    expect(useArchitectureMapSelection.getState().badge).toEqual({
      id: "beta",
      title: "ベータ",
      level: 1,
      summary: "別の受け持ち",
    })
  })

  it("区画のある図でも、区画の箱を選ぶと「この箱について聞く」が出て、子を持つ区画の箱へ潜れる", async () => {
    renderExpanded(LANED)

    const diagram = await screen.findByTestId("architecture-map-diagram")
    expect(diagram.querySelector("[data-lane='outer']")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "ベータ" }))
    fireEvent.click(screen.getByRole("button", { name: "この箱について聞く" }))
    expect(useArchitectureMapSelection.getState().badge?.id).toBe("beta")

    fireEvent.click(screen.getByRole("button", { name: "アルファ" }))
    expect(await screen.findByRole("button", { name: "内側の箱" })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "全体" }))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "ガンマ" })).toBeTruthy()
    })
  })

  it("「+」「−」で倍率が上限・下限で止まり、「全体」で戻る", async () => {
    renderExpanded()
    await screen.findByRole("button", { name: "ベータ" })
    const start = scale()

    for (let step = 0; step < 20; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "拡大" }))
    }
    expect(scale()).toBe(2)
    for (let step = 0; step < 30; step += 1) {
      fireEvent.click(screen.getByRole("button", { name: "縮小" }))
    }
    expect(scale()).toBe(0.25)
    fireEvent.click(screen.getByRole("button", { name: "全体を収める" }))
    expect(scale()).toBe(start)
  })

  it("面の中で + を打つと拡大し、面の外で打っても倍率は変わらない", async () => {
    renderExpanded()
    const surface = await screen.findByRole("dialog", { name: "アーキテクチャの地図" })
    const start = scale()

    fireEvent.keyDown(document.body, { key: "+" })
    expect(scale()).toBe(start)
    fireEvent.keyDown(surface, { key: "+" })
    expect(scale()).toBeGreaterThan(start)
  })

  it("地のドラッグで位置が動き、ホイールでは倍率が変わらない", async () => {
    renderExpanded()
    const stage = await screen.findByTestId("architecture-map-stage")
    const content = stage.firstElementChild
    const start = scale()

    fireEvent.wheel(stage, { deltaY: -200 })
    expect(scale()).toBe(start)
    stage.setPointerCapture = () => undefined
    fireEvent.pointerDown(stage, { clientX: 10, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(stage, { clientX: 60, clientY: 40, pointerId: 1 })
    fireEvent.pointerUp(stage, { pointerId: 1 })

    expect(content instanceof HTMLElement && content.style.transform).toContain("translate(")
    expect(content instanceof HTMLElement && content.style.transform).not.toContain(
      "translate(0px, 0px)",
    )
  })

  it("⎋ と「流れに戻る」で閉じる", async () => {
    renderExpanded()
    const surface = await screen.findByRole("dialog", { name: "アーキテクチャの地図" })

    fireEvent.keyDown(surface, { key: "Escape" })
    expect(useArchitectureMapSelection.getState().expanded).toBe(false)

    useArchitectureMapSelection.setState({ expanded: true })
    fireEvent.click(await screen.findByRole("button", { name: "流れに戻る" }))
    expect(useArchitectureMapSelection.getState().expanded).toBe(false)
  })
})

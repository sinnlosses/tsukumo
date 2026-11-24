import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ArchitectureMapDiagram } from "../../../../src/browser/features/architecture-map/architecture-map-diagram.tsx"
import type { MapView, MapViewBox } from "../../../../src/shared/architecture-map/map-view.ts"

afterEach(() => {
  cleanup()
})

const VIEW: MapView = {
  level: 1,
  boxes: [
    {
      id: "a",
      title: "画面",
      summary: "見せる",
      level: 1,
      external: false,
      hasChildren: true,
      paths: [],
      place: { column: 0, row: 0 },
      problems: [],
    },
    {
      id: "b",
      title: "手続き",
      summary: "受ける",
      level: 1,
      external: false,
      hasChildren: false,
      paths: [],
      place: { column: 1, row: 0 },
      problems: ["undeclared-edge"],
    },
  ],
  edges: [{ from: "a", to: "b", count: 7, undeclared: true }],
  intendedEdges: [{ from: "b", to: "a", label: "返す" }],
  closedCount: 0,
  findings: [],
}

describe("ArchitectureMapDiagram", () => {
  it("箱の数・エッジの数・本数とラベルが応答と一致し、summary を1行出す", () => {
    const { container } = render(
      <ArchitectureMapDiagram view={VIEW} form="full" onSelect={() => undefined} />,
    )

    expect(container.querySelectorAll("[data-box]")).toHaveLength(2)
    expect(container.querySelectorAll("[data-edge]")).toHaveLength(2)
    expect(screen.getByText("7")).toBeTruthy()
    expect(screen.getByText("返す")).toBeTruthy()
    expect(screen.getByText("見せる")).toBeTruthy()
  })

  it("小さく描く形は summary と数を出さない", () => {
    render(<ArchitectureMapDiagram view={VIEW} form="mini" onSelect={() => undefined} />)

    expect(screen.queryByText("見せる")).toBeNull()
    expect(screen.queryByText("7")).toBeNull()
  })

  it("changes を渡すと、箱に data-change と件数の字が付き、入っていない箱は none になる", () => {
    const changes = new Map([["a", { added: 2, other: 0 }]])
    const { container } = render(
      <ArchitectureMapDiagram
        view={VIEW}
        form="mini"
        changes={changes}
        onSelect={() => undefined}
      />,
    )

    expect(container.querySelector("[data-box='a']")?.getAttribute("data-change")).toBe("added")
    expect(container.querySelector("[data-box='b']")?.getAttribute("data-change")).toBe("none")
    expect(screen.getByText("+2")).toBeTruthy()
  })

  it("箱を押すとその箱を返し、選んだ箱としるしが付く", () => {
    const onSelect = vi.fn<(box: MapViewBox) => void>()
    render(<ArchitectureMapDiagram view={VIEW} form="full" selectedId="b" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: "画面" }))

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }))
    expect(screen.getByRole("button", { name: "手続き" }).getAttribute("data-selected")).toBe(
      "true",
    )
  })

  it("区画のある図は、箱1つの区画を区画の色の箱で、外部の区画を枠で描き、名前を2行に折る", () => {
    const laned: MapView = {
      ...VIEW,
      lanes: [
        { id: "front", title: "前", kind: "runtime" },
        { id: "back", title: "後ろ", kind: "runtime" },
        { id: "outer", title: "外部", kind: "external" },
        { id: "common", title: "共有", kind: "crosscut" },
      ],
      boxes: [
        { ...box("f", "画面"), lane: "front" },
        { ...box("b", "手続き"), lane: "back" },
        { ...box("o", "キャラクターパック"), external: true, lane: "outer" },
        { ...box("c", "共有"), lane: "common" },
      ],
      edges: [],
      intendedEdges: [],
    }
    const { container } = render(
      <ArchitectureMapDiagram view={laned} form="mini" onSelect={() => undefined} />,
    )

    expect(
      [...container.querySelectorAll("[data-lane]")].map((lane) => lane.getAttribute("data-lane")),
    ).toEqual(["outer"])
    expect(screen.getByText("外部")).toBeTruthy()
    const front = container.querySelector<SVGGElement>("[data-box='f']")
    expect(front?.getAttribute("data-lane-box")).toBe("true")
    expect(front?.style.getPropertyValue("--lane")).toBe("var(--chart-series-1)")
    expect(
      container.querySelector<SVGGElement>("[data-box='b']")?.style.getPropertyValue("--lane"),
    ).toBe("var(--chart-series-3)")
    expect(
      container.querySelector<SVGGElement>("[data-box='c']")?.style.getPropertyValue("--lane"),
    ).toBe("var(--chart-series-6)")
    expect(
      [...(container.querySelector("[data-box='o']")?.querySelectorAll("tspan") ?? [])].map(
        (line) => line.textContent,
      ),
    ).toEqual(["キャラク", "ターパック"])
  })
})

function box(id: string, title: string): MapViewBox {
  return {
    id,
    title,
    level: 1,
    external: false,
    hasChildren: false,
    paths: [],
    problems: [],
  }
}

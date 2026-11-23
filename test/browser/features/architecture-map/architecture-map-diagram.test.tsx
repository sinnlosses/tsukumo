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

  it("箱を押すとその箱を返し、選んだ箱としるしが付く", () => {
    const onSelect = vi.fn<(box: MapViewBox) => void>()
    render(<ArchitectureMapDiagram view={VIEW} form="full" selectedId="b" onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: "画面" }))

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }))
    expect(screen.getByRole("button", { name: "手続き" }).getAttribute("data-selected")).toBe(
      "true",
    )
  })
})

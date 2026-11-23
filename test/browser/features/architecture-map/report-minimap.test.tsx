import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ReportMinimap } from "../../../../src/browser/features/architecture-map/report-minimap.tsx"
import type { MapViewBox } from "../../../../src/shared/architecture-map/map-view.ts"
import type { ReportMap } from "../../../../src/shared/report/report-map.ts"

afterEach(() => {
  cleanup()
})

function box(id: string, title: string, lane: string, external = false): MapViewBox {
  return { id, title, level: 1, external, hasChildren: false, paths: [], problems: [], lane }
}

const MAP: ReportMap = {
  view: {
    level: 1,
    lanes: [
      { id: "browser", title: "ブラウザ", kind: "runtime" },
      { id: "server", title: "サーバ", kind: "runtime" },
      { id: "external", title: "外部", kind: "external" },
      { id: "shared", title: "共有層", kind: "crosscut" },
    ],
    boxes: [
      box("outside", "外の相手", "external", true),
      box("server", "サーバ", "server"),
      box("browser", "ブラウザ", "browser"),
      box("shared", "共有層", "shared"),
    ],
    edges: [],
    intendedEdges: [],
    closedCount: 0,
    findings: [],
  },
  files: [
    { path: "src/browser/a.tsx", boxes: ["browser"] },
    { path: "src/shared/b.ts", boxes: ["shared", "shared/report"] },
  ],
  drift: [],
}

describe("ReportMinimap", () => {
  it("区画のある地図では区画の箱に変えた件数と色が付き、外部の中の箱は件数を持たない", () => {
    const { container } = render(
      <ReportMinimap
        map={MAP}
        changed={[
          { path: "src/browser/a.tsx", change: "added" },
          { path: "src/shared/b.ts", change: "modified" },
        ]}
        onSelect={() => undefined}
      />,
    )

    expect(container.querySelector("[data-lane='external']")).toBeTruthy()
    const browser = container.querySelector("[data-box='browser']")
    expect(browser?.getAttribute("data-lane-box")).toBe("true")
    expect(browser?.getAttribute("data-change")).toBe("added")
    expect(browser?.textContent).toContain("+1")
    expect(container.querySelector("[data-box='shared']")?.getAttribute("data-change")).toBe(
      "modified",
    )
    expect(container.querySelector("[data-box='server']")?.getAttribute("data-change")).toBe("none")
    expect(container.querySelector("[data-box='outside']")?.getAttribute("data-change")).toBe(
      "none",
    )
  })

  it("区画の箱を押すと、その大の箱の ID で絞り込む", () => {
    const onSelect = vi.fn<(boxId: string) => void>()
    render(<ReportMinimap map={MAP} changed={[]} onSelect={onSelect} />)

    fireEvent.click(screen.getByRole("button", { name: "共有層" }))

    expect(onSelect).toHaveBeenCalledWith("shared")
  })
})

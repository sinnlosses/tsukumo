import { describe, expect, it } from "vitest"

import type { MapView } from "../../../src/shared/architecture-map/map-view.ts"
import type { ChangedFile } from "../../../src/shared/report/changed-file.ts"
import {
  changedBoxCountsOf,
  filesInBox,
  type ReportMap,
} from "../../../src/shared/report/report-map.ts"

const VIEW: MapView = {
  level: 1,
  boxes: [],
  edges: [],
  intendedEdges: [],
  closedCount: 0,
  findings: [],
}

const MAP: ReportMap = {
  view: VIEW,
  files: [
    { path: "src/ui/a.ts", boxes: ["app", "app/ui", "src/ui/part"] },
    { path: "src/ui/b.ts", boxes: ["app", "app/ui", "src/ui/page"] },
    { path: "src/view/c.ts", boxes: ["app", "app/view"] },
    { path: "src/server/d.ts", boxes: ["server"] },
  ],
  drift: [],
}

const CHANGED: readonly ChangedFile[] = [
  { path: "src/ui/a.ts", change: "added" },
  { path: "src/ui/b.ts", change: "modified" },
  { path: "src/view/c.ts", change: "deleted" },
  { path: "src/server/d.ts", change: "added" },
  { path: "outside/x.txt", change: "modified" },
]

describe("changedBoxCountsOf", () => {
  it("大の箱ごとに子の分を足し、追加とそれ以外を分けて数える", () => {
    expect(changedBoxCountsOf(MAP, CHANGED)).toEqual(
      new Map([
        ["app", { added: 1, other: 2 }],
        ["server", { added: 1, other: 0 }],
      ]),
    )
  })
})

describe("filesInBox", () => {
  it("大・中・小のどの箱の ID でも絞れる", () => {
    expect([...filesInBox(MAP, "app")]).toEqual(["src/ui/a.ts", "src/ui/b.ts", "src/view/c.ts"])
    expect([...filesInBox(MAP, "app/ui")]).toEqual(["src/ui/a.ts", "src/ui/b.ts"])
    expect([...filesInBox(MAP, "src/ui/page")]).toEqual(["src/ui/b.ts"])
  })
})

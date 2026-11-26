import { describe, expect, it } from "vitest"

import {
  ancestorIdsOf,
  resolveMapBox,
} from "../../../../src/browser/features/architecture-map/map-box-lookup.ts"
import type { MapBoxIndexEntry } from "../../../../src/shared/architecture-map/map-view.ts"

const BOXES: readonly MapBoxIndexEntry[] = [
  { id: "app", title: "アプリ", level: 1, aliases: ["frontend"] },
  { id: "app/ui", title: "部品", level: 2, parent: "app", aliases: [] },
  { id: "src/ui/part", title: "src/ui/part", level: 3, parent: "app/ui", aliases: [] },
]

const foundId = (id: string) => {
  const lookup = resolveMapBox(BOXES, id)
  return lookup.kind === "found" ? lookup.box.id : undefined
}

describe("resolveMapBox", () => {
  it("今の ID で箱を返す（小の箱も）", () => {
    expect(foundId("app")).toBe("app")
    expect(foundId("src/ui/part")).toBe("src/ui/part")
  })

  it("別名は今の箱に解く", () => {
    expect(foundId("frontend")).toBe("app")
  })

  it("知らない ID は unknown", () => {
    expect(resolveMapBox(BOXES, "nowhere")).toEqual({ kind: "unknown" })
  })
})

describe("ancestorIdsOf", () => {
  it("いちばん上の親から、すぐ上の親までを並べる（箱自身は入れない）", () => {
    expect(ancestorIdsOf(BOXES, "src/ui/part")).toEqual(["app", "app/ui"])
    expect(ancestorIdsOf(BOXES, "app")).toEqual([])
    expect(ancestorIdsOf(BOXES, "nowhere")).toEqual([])
  })
})

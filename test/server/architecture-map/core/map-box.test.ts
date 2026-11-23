import { describe, expect, it } from "vitest"

import { mapBoxIndexOf, mapBoxOf } from "../../../../src/server/architecture-map/core/map-box.ts"
import { parseArchitectureMap } from "../../../../src/server/architecture-map/core/map-parse.ts"
import type { ArchitectureMap } from "../../../../src/shared/architecture-map/architecture-map.ts"
import { sampleMap } from "../sample-map.ts"

function loadedMap(): ArchitectureMap {
  const parsed = parseArchitectureMap(JSON.stringify(sampleMap()))
  if (parsed.kind !== "map") {
    throw new Error("サンプルの地図が読めない")
  }
  return parsed.map
}

type Counted = { readonly id: string; readonly children?: readonly Counted[] }

const countBoxes = (boxes: readonly Counted[]): number =>
  boxes.reduce((sum, box) => sum + 1 + countBoxes(box.children ?? []), 0)

describe("mapBoxIndexOf", () => {
  it("大・中・小の全部が入り、親と別名が付く", () => {
    const index = mapBoxIndexOf(loadedMap())

    expect(index.map((box) => box.id)).toEqual([
      "app",
      "app/ui",
      "src/ui/part",
      "src/ui/page",
      "app/view",
      "src/view/core",
      "server",
      "server/store",
      "src/server/store",
      "vault",
    ])
    expect(index.find((box) => box.id === "app")).toMatchObject({
      level: 1,
      aliases: ["frontend"],
    })
    expect(index.find((box) => box.id === "src/ui/part")).toMatchObject({
      level: 3,
      parent: "app/ui",
      aliases: [],
    })
    expect(index.find((box) => box.id === "app")?.parent).toBeUndefined()
  })

  it("木の箱を再帰で数えた数と索引の数が一致し、子を1つ落とすと一致しない", () => {
    const sample = sampleMap()
    expect(mapBoxIndexOf(loadedMap())).toHaveLength(countBoxes(sample.boxes))

    const dropped = sampleMap()
    const ui = dropped.boxes[0]?.children?.[0]
    if (ui === undefined) {
      throw new Error("サンプルの地図に app/ui が無い")
    }
    ui.children = ui.children.slice(1)
    expect(mapBoxIndexOf(loadedMap())).not.toHaveLength(countBoxes(dropped.boxes))
  })
})

describe("mapBoxOf", () => {
  it("ID を省くと大・中の箱の一覧を返し、小の箱は含めない", () => {
    const outcome = mapBoxOf(loadedMap())

    expect(outcome.kind).toBe("list")
    if (outcome.kind === "list") {
      expect(outcome.boxes.map((box) => box.id)).toEqual([
        "app",
        "app/ui",
        "app/view",
        "server",
        "server/store",
        "vault",
      ])
    }
  })

  it("ID で箱の定義と、その箱が端のエッジと親子を返す", () => {
    const outcome = mapBoxOf(loadedMap(), "app")

    expect(outcome).toMatchObject({
      kind: "box",
      id: "app",
      title: "アプリ",
      level: 1,
      purpose: "画面を手続きの実装から隔てる",
      paths: ["src/ui/**", "src/view/**"],
      children: ["app/ui", "app/view"],
    })
    expect(outcome.kind === "box" ? outcome.edges : []).toContainEqual({
      id: "server",
      title: "server",
      direction: "out",
      count: 4,
    })
  })

  it("別名でも同じ箱を引ける", () => {
    expect(mapBoxOf(loadedMap(), "frontend")).toMatchObject({ kind: "box", id: "app" })
  })

  it("知らない ID は unknown-box", () => {
    expect(mapBoxOf(loadedMap(), "nothing")).toEqual({ kind: "unknown-box" })
  })
})

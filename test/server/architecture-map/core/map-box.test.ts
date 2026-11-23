import { describe, expect, it } from "vitest"

import { mapBoxOf } from "../../../../src/server/architecture-map/core/map-box.ts"
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

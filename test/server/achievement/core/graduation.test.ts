import { describe, expect, it } from "vitest"

import { graduationsOf } from "../../../../src/server/achievement/core/graduation.ts"

describe("graduationsOf", () => {
  it("登録から7日以上のものだけを、登録の古い順で返す", () => {
    const items = [
      { id: "T-001", summary: "7日ちょうど" },
      { id: "T-002", summary: "6日（まだ）" },
      { id: "T-003", summary: "登録日が無い" },
    ]
    const registeredOnById = new Map([
      ["T-001", "2026-09-16"],
      ["T-002", "2026-09-17"],
    ])

    expect(graduationsOf(items, registeredOnById, "2026-09-23")).toEqual([
      { id: "T-001", summary: "7日ちょうど", registeredOn: "2026-09-16", days: 7 },
    ])
  })

  it("複数の卒業は登録の古い順に並べる", () => {
    const items = [
      { id: "T-001", summary: "新しく登録した方" },
      { id: "T-002", summary: "長く待っていた方" },
    ]
    const registeredOnById = new Map([
      ["T-001", "2026-09-10"],
      ["T-002", "2026-09-01"],
    ])

    expect(graduationsOf(items, registeredOnById, "2026-09-23").map((g) => g.id)).toEqual([
      "T-002",
      "T-001",
    ])
  })
})

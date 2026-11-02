import { describe, expect, it } from "vitest"

import {
  entriesUntilWindow,
  type TimedEntry,
} from "../../../../../src/server/chat/core/consolidation/chat-unconsolidated-selection.ts"

function entryAt(at: string): TimedEntry {
  return { at, line: { kind: "speech", text: "架空の発言", origin: { mode: "chat" } } }
}

const A = entryAt("2026-01-01T10:00:00+09:00")
const B = entryAt("2026-01-01T11:00:00+09:00")
const C = entryAt("2026-01-01T12:00:00+09:00")

describe("entriesUntilWindow", () => {
  it("印も窓も無ければ全部を返す", () => {
    expect(entriesUntilWindow([A, B, C], undefined, undefined)).toEqual([A, B, C])
  })

  it("印の時刻と同じ行までは含めない（後の行だけ）", () => {
    expect(entriesUntilWindow([A, B, C], B.at, undefined)).toEqual([C])
  })

  it("窓の先頭の行からは含めない", () => {
    expect(entriesUntilWindow([A, B, C], undefined, C.at)).toEqual([A, B])
  })

  it("オフセットが違っても同じ時刻なら同じ時刻として比べる", () => {
    expect(entriesUntilWindow([A, B, C], "2026-01-01T01:00:00Z", "2026-01-01T03:00:00Z")).toEqual([
      B,
    ])
  })

  it("印より後が窓に埋まっていれば空", () => {
    expect(entriesUntilWindow([A, B], B.at, B.at)).toEqual([])
  })
})

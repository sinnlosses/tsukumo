import { describe, expect, it } from "vitest"

import { DEFAULT_VIEW_PORT } from "../../../src/server/view-server/core/port-resolution.ts"
import { roomName } from "../../../src/shared/view-server/room.ts"

describe("roomName", () => {
  // 語彙の1つめは既定のポート（`shared` からサーバ側を import できないので値を写してある）。
  // 写した値がずれたらここで落ちる——ずれると既定で起こした tsukumo が2つめの名前を名乗る。
  it("語彙の1つめのポートは、ビューの既定のポートと同じ", () => {
    expect(roomName(DEFAULT_VIEW_PORT)).toBe("空色の間")
  })

  it("語彙の12個は互いに違う名前で、先頭は「空色の間」", () => {
    const named = Array.from({ length: 12 }, (_, index) => roomName(DEFAULT_VIEW_PORT + index))

    expect(named[0]).toBe("空色の間")
    expect(new Set(named).size).toBe(12)
    expect(named.some((name) => /^\d+$/.test(name))).toBe(false)
  })

  it("語彙の並びから外れたポート（13個めから先・遠い番号・手前の番号・OS まかせの 0）は番号のまま", () => {
    expect(roomName(DEFAULT_VIEW_PORT + 12)).toBe("7339")
    expect(roomName(DEFAULT_VIEW_PORT + 19)).toBe("7346")
    expect(roomName(9000)).toBe("9000")
    expect(roomName(DEFAULT_VIEW_PORT - 1)).toBe("7326")
    expect(roomName(0)).toBe("0")
  })
})

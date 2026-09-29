import { describe, expect, it } from "vitest"

import { DEFAULT_VIEW_PORT } from "../../../src/server/view-server/core/port-resolution.ts"
import { FIRST_ROOM_PORT, roomName } from "../../../src/shared/view-server/room.ts"

describe("roomName", () => {
  // 語彙の1つめは既定のポート（`shared` からサーバ側を import できないので値を写してある）。
  // 写した値がずれたらここで落ちる——ずれると既定で起こした tsukumo が2つめの名前を名乗る。
  it("語彙の1つめのポートは、ビューの既定のポートと同じ", () => {
    expect(FIRST_ROOM_PORT).toBe(DEFAULT_VIEW_PORT)
  })

  it("語彙の12個は互いに違う名前で、先頭は「空色の間」", () => {
    const named = Array.from({ length: 12 }, (_, index) => roomName(FIRST_ROOM_PORT + index))

    expect(named[0]).toBe("空色の間")
    expect(new Set(named).size).toBe(12)
    expect(named.some((name) => /^\d+$/.test(name))).toBe(false)
  })

  // 語彙の外はポート番号をそのまま名乗る（13個め以降・遠い番号・OS まかせの 0）。
  it("13個めから先のポートは、ポート番号をそのまま名乗る", () => {
    expect(roomName(FIRST_ROOM_PORT + 12)).toBe("7339")
    expect(roomName(FIRST_ROOM_PORT + 19)).toBe("7346")
  })

  it("語彙の並びから外れたポート（遠い番号・手前の番号・OS まかせの 0）も番号のまま", () => {
    expect(roomName(9000)).toBe("9000")
    expect(roomName(FIRST_ROOM_PORT - 1)).toBe("7326")
    expect(roomName(0)).toBe("0")
  })
})

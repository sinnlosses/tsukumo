import { describe, expect, it } from "bun:test"

import {
  selectCharacterPack,
  selectInitialCharacterPack,
} from "../../../src/server/core/character-selection.ts"

// パックは名前だけを見る（中身を読むのは src/server/adapter/character-pack.ts の仕事）。
// 名前は手で書いた架空のもの。
const BUNDLED = { name: "tsukumo-spirit" }
const HOME = { name: "kagami" }
const PACKS = [BUNDLED, HOME]

describe("selectCharacterPack", () => {
  it("一覧にある名前は、そのパックを返す", () => {
    expect(selectCharacterPack(PACKS, BUNDLED, "kagami")).toBe(HOME)
  })

  it("一覧に無い名前は既定へ落ちる（名前をパスとして組み立てない）", () => {
    expect(selectCharacterPack(PACKS, BUNDLED, "../../etc")).toBe(BUNDLED)
  })

  it("名前が無いときも既定へ落ちる", () => {
    expect(selectCharacterPack(PACKS, BUNDLED, undefined)).toBe(BUNDLED)
  })
})

describe("selectInitialCharacterPack", () => {
  it("その回の指定があるときは、覚えた値を見ずに既定（指定から読んだパック）を使う", () => {
    let read = 0

    const pack = selectInitialCharacterPack({
      packs: PACKS,
      fallback: BUNDLED,
      specified: "characters/local",
      readRemembered: () => {
        read += 1
        return "kagami"
      },
    })

    expect(pack).toBe(BUNDLED)
    expect(read).toBe(0)
  })

  it("指定が無ければ、覚えた名前のパックを使う", () => {
    const pack = selectInitialCharacterPack({
      packs: PACKS,
      fallback: BUNDLED,
      specified: undefined,
      readRemembered: () => "kagami",
    })

    expect(pack).toBe(HOME)
  })

  it("覚えた名前が一覧に無ければ既定へ落ちる", () => {
    const pack = selectInitialCharacterPack({
      packs: PACKS,
      fallback: BUNDLED,
      specified: undefined,
      readRemembered: () => "消えたパック",
    })

    expect(pack).toBe(BUNDLED)
  })

  it("覚えた値が無ければ既定を使う", () => {
    const pack = selectInitialCharacterPack({
      packs: PACKS,
      fallback: BUNDLED,
      specified: undefined,
      readRemembered: () => undefined,
    })

    expect(pack).toBe(BUNDLED)
  })
})

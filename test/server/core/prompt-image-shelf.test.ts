import { describe, expect, it } from "bun:test"

import {
  createPromptImageShelf,
  MAX_SHELVED_PROMPT_IMAGE_BYTES,
  releasedPromptImageIds,
} from "../../../src/server/core/prompt-image-shelf.ts"
import { type PromptImage, promptImageIdSchema } from "../../../src/shared/prompt-image.ts"
import { type SessionRecord } from "../../../src/shared/session-state.ts"

// 画像はすべて手で書いた架空の data URL（実物の画像は使わない。
// docs/coding-standards.md「会話内容の扱い」）。

function image(label: string): PromptImage {
  return {
    full: `data:image/png;base64,full${label}`,
    thumbnail: `data:image/png;base64,thumb${label}`,
  }
}

// 合計の大きさを確かめるテスト用に、同じ文字を並べて `full` の文字数を指定の大きさに
// そろえた架空の data URL（実物の画像は使わない）。
function sizedImage(label: string, size: number): PromptImage {
  return {
    full: `data:image/png;base64,${label}`.padEnd(size, "A"),
    thumbnail: `data:image/png;base64,thumb${label}`,
  }
}

function requestRecord(turnId: number, ids: readonly string[]): SessionRecord {
  return {
    kind: "request",
    turnId,
    text: "架空の依頼",
    images: ids.map((id) => ({ id, thumbnail: `data:image/png;base64,thumb${id}` })),
    time: { kind: "stamped", at: 1_000 },
  }
}

describe("createPromptImageShelf", () => {
  it("置いた原寸を、返した id で引ける", () => {
    const shelf = createPromptImageShelf()

    const [shelved] = shelf.shelve([image("A")])

    expect(shelved?.full).toBe(image("A").full)
    expect(shelved?.thumbnail).toBe(image("A").thumbnail)
    expect(shelf.find(shelved?.id ?? "")).toBe(image("A").full)
  })

  it("id は推測できない値（UUID）で、1枚ごとに違う", () => {
    const shelf = createPromptImageShelf()

    const shelved = shelf.shelve([image("A"), image("B")])
    const ids = shelved.map((entry) => entry.id)

    expect(ids.every((id) => promptImageIdSchema.safeParse(id).success)).toBe(true)
    expect(new Set(ids).size).toBe(2)
  })

  it("置いていない id では何も引けない", () => {
    const shelf = createPromptImageShelf()
    shelf.shelve([image("A")])

    expect(shelf.find("00000000-0000-4000-8000-000000000000")).toBeUndefined()
  })

  it("0.5 MiB の画像なら20枚置いても全部残る", () => {
    const shelf = createPromptImageShelf()
    const halfMebibyte = 512 * 1024

    const entries = Array.from({ length: 20 }, (_, index) =>
      shelf.shelve([sizedImage(String(index), halfMebibyte)]),
    ).flat()

    expect(entries).toHaveLength(20)
    expect(entries.every((entry) => shelf.find(entry.id) === entry.full)).toBe(true)
  })

  it("合計の大きさが上限を超えるあいだ、古いほうから捨てる", () => {
    const shelf = createPromptImageShelf()
    const quarter = MAX_SHELVED_PROMPT_IMAGE_BYTES / 4

    // 4枚ぶん（ちょうど上限）まではどれも残る。
    const first = shelf.shelve([sizedImage("a", quarter)])[0]
    const second = shelf.shelve([sizedImage("b", quarter)])[0]
    const third = shelf.shelve([sizedImage("c", quarter)])[0]
    const fourth = shelf.shelve([sizedImage("d", quarter)])[0]
    expect(
      [first, second, third, fourth].every((entry) => shelf.find(entry?.id ?? "") !== undefined),
    ).toBe(true)

    // 5枚目で合計が上限を超え、いちばん古い1枚目だけが落ちる。
    const fifth = shelf.shelve([sizedImage("e", quarter)])[0]

    expect(shelf.find(first?.id ?? "")).toBeUndefined()
    expect(
      [second, third, fourth, fifth].every((entry) => shelf.find(entry?.id ?? "") !== undefined),
    ).toBe(true)
  })

  it("release した id は引けなくなり、他は残る", () => {
    const shelf = createPromptImageShelf()
    const [a, b] = shelf.shelve([image("A"), image("B")])

    shelf.release([a?.id ?? ""])

    expect(shelf.find(a?.id ?? "")).toBeUndefined()
    expect(shelf.find(b?.id ?? "")).toBe(image("B").full)
  })
})

describe("releasedPromptImageIds", () => {
  it("前の記録にあって後の記録から消えた id だけを返す（窓から落ちた依頼の原寸）", () => {
    const before = [requestRecord(0, ["old-1", "old-2"]), requestRecord(1, ["kept"])]
    const after = [requestRecord(1, ["kept"]), requestRecord(2, ["new"])]

    expect(releasedPromptImageIds(before, after)).toEqual(["old-1", "old-2"])
  })

  it("記録が空に戻った（起こし直した）ときは、前の記録の id をすべて返す", () => {
    const before = [requestRecord(0, ["a"]), requestRecord(1, ["b"])]

    expect(releasedPromptImageIds(before, [])).toEqual(["a", "b"])
  })

  it("まだ記録に載っていない id（依頼のイベントが届く前）は返さない", () => {
    // 棚に置いてから `request` が畳まれるまでの間に別のイベントが来ても、その id は
    // 前の記録にも後の記録にも無いので捨てられない。
    const records = [requestRecord(0, ["a"])]

    expect(releasedPromptImageIds(records, records)).toEqual([])
  })
})

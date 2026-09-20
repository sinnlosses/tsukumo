import { describe, expect, it } from "bun:test"

import { resolveOutfit } from "../../src/shared/expression.ts"

describe("resolveOutfit", () => {
  it("モデル名が無いとき既定の衣装を返す", () => {
    expect(resolveOutfit(undefined)).toBe("default")
  })

  it("haiku は軽装", () => {
    expect(resolveOutfit("haiku")).toBe("light")
  })

  it("sonnet は通常装備", () => {
    expect(resolveOutfit("sonnet")).toBe("normal")
  })

  it("opus は戦闘配置", () => {
    expect(resolveOutfit("opus")).toBe("heavy")
  })

  it("fable は opus と同じ戦闘配置", () => {
    expect(resolveOutfit("fable")).toBe("heavy")
  })

  // 短い別名か完全なモデルIDかは場合によるため部分一致にしている（src/shared/expression.ts の
  // コメント参照）。完全なモデルIDでも拾えることをここで固定する。
  it("完全なモデルIDに含まれていても拾う", () => {
    expect(resolveOutfit("claude-opus-4-1-20250805")).toBe("heavy")
  })

  it("大文字・小文字が違っても拾う", () => {
    expect(resolveOutfit("Opus")).toBe("heavy")
  })

  it("知らないモデル名のときは既定の衣装に落ちる", () => {
    expect(resolveOutfit("some-future-model")).toBe("default")
  })
})

import { describe, expect, it } from "bun:test"

import { describeStatus, resolveExpression, resolveOutfit } from "../src/expression.ts"

describe("resolveExpression", () => {
  it("状態ファイルが無いとき既定の表情を返す", () => {
    expect(resolveExpression(undefined)).toBe("default")
  })

  it("PreToolUse は作業中の表情を返す", () => {
    expect(resolveExpression({ event: "PreToolUse", model: undefined })).toBe("working")
  })

  it("Stop はどや顔を返す", () => {
    expect(resolveExpression({ event: "Stop", model: undefined })).toBe("proud")
  })

  it("StopFailure はあわあわを返す", () => {
    expect(resolveExpression({ event: "StopFailure", model: undefined })).toBe("flustered")
  })

  it("PostToolUseFailure もあわあわを返す", () => {
    expect(resolveExpression({ event: "PostToolUseFailure", model: undefined })).toBe("flustered")
  })

  it("未知のイベント種別のときは既定の表情に落ちる", () => {
    expect(resolveExpression({ event: "SomeFutureEvent", model: undefined })).toBe("default")
  })
})

describe("resolveOutfit", () => {
  it("状態ファイルが無いとき既定の衣装を返す", () => {
    expect(resolveOutfit(undefined)).toBe("default")
  })

  it("model が無いとき既定の衣装を返す", () => {
    expect(resolveOutfit({ event: "PreToolUse", model: undefined })).toBe("default")
  })

  it("haiku は軽装", () => {
    expect(resolveOutfit({ event: "SessionStart", model: "haiku" })).toBe("light")
  })

  it("sonnet は通常装備", () => {
    expect(resolveOutfit({ event: "SessionStart", model: "sonnet" })).toBe("normal")
  })

  it("opus は戦闘配置", () => {
    expect(resolveOutfit({ event: "SessionStart", model: "opus" })).toBe("heavy")
  })

  // hook の payload に渡る model が短い別名か解決済みの完全なモデルIDかを確認できなかったため、
  // 部分一致にしている（src/expression.ts のコメント参照）。完全なモデルIDでも拾えることを
  // ここで固定する。
  it("完全なモデルIDに含まれていても拾う", () => {
    expect(resolveOutfit({ event: "SessionStart", model: "claude-opus-4-1-20250805" })).toBe(
      "heavy",
    )
  })

  it("大文字・小文字が違っても拾う", () => {
    expect(resolveOutfit({ event: "SessionStart", model: "Opus" })).toBe("heavy")
  })

  it("知らないモデル名のときは既定の衣装に落ちる", () => {
    expect(resolveOutfit({ event: "SessionStart", model: "some-future-model" })).toBe("default")
  })
})

describe("describeStatus", () => {
  it("表情と衣装を1行のテキストにまとめる", () => {
    expect(describeStatus("working", "heavy")).toBe("［表情: 作業中 ／ 衣装: 戦闘配置］")
  })

  it("既定値も日本語ラベルで表示する", () => {
    expect(describeStatus("default", "default")).toBe("［表情: 通常 ／ 衣装: 不明］")
  })
})

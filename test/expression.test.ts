import { describe, expect, it } from "bun:test"

import { expressionLabel, resolveExpression, resolveOutfit } from "../src/expression.ts"

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

  // 短い別名か完全なモデルIDかは場合によるため部分一致にしている（src/expression.ts の
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

describe("expressionLabel", () => {
  it("表情を日本語ラベルにする", () => {
    expect(expressionLabel("working")).toBe("作業中")
    expect(expressionLabel("proud")).toBe("どや顔")
    expect(expressionLabel("flustered")).toBe("あわあわ")
  })

  it("既定の表情も日本語ラベルで表示する", () => {
    expect(expressionLabel("default")).toBe("通常")
  })
})

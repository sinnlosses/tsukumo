import { describe, expect, it } from "bun:test"

import {
  nextWorkingTransitionDelayMs,
  resolveExpression,
  resolveOutfit,
} from "../../src/protocol/expression.ts"

describe("resolveExpression", () => {
  it("実行中のツールが開始から1秒以上経っていれば作業中の表情を返す", () => {
    expect(resolveExpression([{ startedAt: 0 }], "proud", 1000)).toBe("working")
  })

  it("実行中のツールが開始から1秒未満なら直近の speak の表情を返す", () => {
    expect(resolveExpression([{ startedAt: 0 }], "proud", 999)).toBe("proud")
  })

  it("speak があり実行中のツールが無ければその表情を返す", () => {
    expect(resolveExpression([], "flustered", 0)).toBe("flustered")
  })

  it("speak がまだ無く実行中のツールも無ければ default を返す（呼び出し側の既定）", () => {
    expect(resolveExpression([], "default", 0)).toBe("default")
  })

  it("ターンが終わったあとも、実行中のツールが無ければ直近の speak の表情を保つ", () => {
    // ターンの終わり（turn-finished）は resolveExpression の入力に現れない
    // （speechExpression は session-view.ts が持ち続ける）。ここでは実行中のツールが無い状態で
    // speechExpression がそのまま返ることを固定する。
    expect(resolveExpression([], "proud", 5000)).toBe("proud")
  })

  it("実行中のツールが複数あり、どれか1つでも1秒以上経っていれば作業中になる", () => {
    expect(resolveExpression([{ startedAt: 900 }, { startedAt: 0 }], "proud", 1000)).toBe("working")
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

  // 短い別名か完全なモデルIDかは場合によるため部分一致にしている（src/protocol/expression.ts の
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

describe("nextWorkingTransitionDelayMs", () => {
  it("実行中のツールが無ければ undefined（再計算のタイマーは要らない）", () => {
    expect(nextWorkingTransitionDelayMs([], 0)).toBeUndefined()
  })

  it("すでに1秒以上経っているツールしか無ければ undefined", () => {
    expect(nextWorkingTransitionDelayMs([{ startedAt: 0 }], 1500)).toBeUndefined()
  })

  it("まだ1秒経っていないツールがあれば、超えるまでの残り時間を返す", () => {
    expect(nextWorkingTransitionDelayMs([{ startedAt: 0 }], 700)).toBe(300)
  })

  it("複数あるときは、いちばん早く超えるものまでの残り時間を返す", () => {
    expect(nextWorkingTransitionDelayMs([{ startedAt: 0 }, { startedAt: 500 }], 700)).toBe(300)
  })
})

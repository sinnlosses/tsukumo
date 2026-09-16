import { describe, expect, it } from "bun:test"

import {
  nextWorkingTransitionDelayMs,
  resolveExpression,
  resolveOutfit,
  WORKING_EXPRESSION_COOLDOWN_MS,
} from "../../src/protocol/expression.ts"

describe("resolveExpression", () => {
  it("実行中のツールが開始から1秒以上経っていれば作業中の表情を返す", () => {
    expect(resolveExpression([{ startedAt: 0 }], "proud", undefined, 1000)).toBe("working")
  })

  it("実行中のツールが開始から1秒未満なら直近の speak の表情を返す", () => {
    expect(resolveExpression([{ startedAt: 0 }], "proud", undefined, 999)).toBe("proud")
  })

  it("speak があり実行中のツールが無ければその表情を返す", () => {
    expect(resolveExpression([], "flustered", undefined, 0)).toBe("flustered")
  })

  it("speak がまだ無く実行中のツールも無ければ default を返す（呼び出し側の既定）", () => {
    expect(resolveExpression([], "default", undefined, 0)).toBe("default")
  })

  it("ターンが終わったあとも、実行中のツールが無ければ直近の speak の表情を保つ", () => {
    // ターンの終わり（turn-finished）は resolveExpression の入力に現れない
    // （speechExpression は session-view.ts が持ち続ける）。ここでは実行中のツールが無い状態で
    // speechExpression がそのまま返ることを固定する。
    expect(resolveExpression([], "proud", undefined, 5000)).toBe("proud")
  })

  it("実行中のツールが複数あり、どれか1つでも1秒以上経っていれば作業中になる", () => {
    expect(
      resolveExpression([{ startedAt: 900 }, { startedAt: 0 }], "proud", undefined, 1000),
    ).toBe("working")
  })

  it("ツールが終わってもクールダウン中は working のまま", () => {
    // 100 でツールが終わった（lastToolFinishedAt = 100）。実行中のツールは無い。
    // クールダウン（4000ms）が明ける前の 3000 では、まだ working を保つ。
    expect(resolveExpression([], "proud", 100, 3000)).toBe("working")
  })

  it("クールダウン中に新しい speak が来ても、明けるまでは working のまま", () => {
    // speechExpression が新しい speak で書き換わっていても、クールダウン中は無視する
    // （2026-09-16 決定。蒸し返さない）。
    expect(resolveExpression([], "flustered", 100, 3000)).toBe("working")
  })

  it("クールダウンが明けたら speechExpression に戻る", () => {
    expect(resolveExpression([], "proud", 100, 100 + WORKING_EXPRESSION_COOLDOWN_MS)).toBe("proud")
  })

  it("クールダウン中に始まったツールは、1秒の遅延を待たず即座に working になる（隙間で往復しない）", () => {
    // 前のツールが 100 で終わり、クールダウン中の 200 に次のツールが始まった。
    // まだ開始から1秒経っていない（now=300）が、クールダウン中に始まったので即座に working。
    expect(resolveExpression([{ startedAt: 200 }], "proud", 100, 300)).toBe("working")
  })

  it("クールダウンが明けたあとに始まったツールは、通常どおり1秒の遅延を待つ", () => {
    const startedAt = 100 + WORKING_EXPRESSION_COOLDOWN_MS + 10
    expect(resolveExpression([{ startedAt }], "proud", 100, startedAt + 500)).toBe("proud")
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
  it("実行中のツールが無く、クールダウンも無ければ undefined（再計算のタイマーは要らない）", () => {
    expect(nextWorkingTransitionDelayMs([], undefined, 0)).toBeUndefined()
  })

  it("すでに1秒以上経っているツールしか無く、クールダウンも無ければ undefined", () => {
    expect(nextWorkingTransitionDelayMs([{ startedAt: 0 }], undefined, 1500)).toBeUndefined()
  })

  it("まだ1秒経っていないツールがあれば、超えるまでの残り時間を返す", () => {
    expect(nextWorkingTransitionDelayMs([{ startedAt: 0 }], undefined, 700)).toBe(300)
  })

  it("複数あるときは、いちばん早く超えるものまでの残り時間を返す", () => {
    expect(
      nextWorkingTransitionDelayMs([{ startedAt: 0 }, { startedAt: 500 }], undefined, 700),
    ).toBe(300)
  })

  it("クールダウンが残っていれば、明けるまでの残り時間を返す（実行中のツールが無くても）", () => {
    expect(nextWorkingTransitionDelayMs([], 100, 3000)).toBe(
      100 + WORKING_EXPRESSION_COOLDOWN_MS - 3000,
    )
  })

  it("クールダウンをすでに過ぎていれば undefined", () => {
    expect(
      nextWorkingTransitionDelayMs([], 100, 100 + WORKING_EXPRESSION_COOLDOWN_MS),
    ).toBeUndefined()
  })

  it("クールダウン中に始まったツールは遅延超えの候補から外れる（すでに working なので再計算は要らない）", () => {
    // ツール自身の1秒の遅延（startedAt + 1000 = 1200）より先にクールダウンの残り
    // （100 + 4000 - 300 = 3800）が来るはずだが、クールダウン中に始まったツールは
    // 遅延超えの候補から外れるので、残るのはクールダウン明けの残り時間だけになる。
    expect(nextWorkingTransitionDelayMs([{ startedAt: 200 }], 100, 300)).toBe(
      100 + WORKING_EXPRESSION_COOLDOWN_MS - 300,
    )
  })
})

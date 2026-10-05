import { describe, expect, test } from "vitest"

import { readPreparationFlag } from "../../scripts/lib/capture-preparation.ts"

describe("readPreparationFlag", () => {
  test("--click・--hover・--hash は値1つを使う", () => {
    expect(readPreparationFlag(["--click", "button"], 0)).toEqual({
      step: { kind: "click", selector: "button" },
      consumed: 2,
    })
    expect(readPreparationFlag(["--hover", "a"], 0)).toEqual({
      step: { kind: "hover", selector: "a" },
      consumed: 2,
    })
    expect(readPreparationFlag(["x", "--hash", "#diary"], 1)).toEqual({
      step: { kind: "hash", hash: "#diary" },
      consumed: 2,
    })
  })

  test("--type は値を2つ使う", () => {
    expect(readPreparationFlag(["--type", "textarea", "/"], 0)).toEqual({
      step: { kind: "type", selector: "textarea", text: "/" },
      consumed: 3,
    })
  })

  test("--advance は正の整数のミリ秒を読む", () => {
    expect(readPreparationFlag(["--advance", "130000"], 0)).toEqual({
      step: { kind: "advance", ms: 130000 },
      consumed: 2,
    })
    for (const bad of ["0", "-5", "1.5", "abc"]) {
      expect(readPreparationFlag(["--advance", bad], 0)).toBeUndefined()
    }
  })

  test("値が足りない・知らない旗は読まない", () => {
    expect(readPreparationFlag(["--type", "textarea"], 0)).toBeUndefined()
    expect(readPreparationFlag(["--click"], 0)).toBeUndefined()
    expect(readPreparationFlag(["--out", "x"], 0)).toBeUndefined()
  })
})

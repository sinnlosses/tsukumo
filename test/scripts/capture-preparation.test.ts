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

  test("値が足りない・知らない旗は読まない", () => {
    expect(readPreparationFlag(["--type", "textarea"], 0)).toBeUndefined()
    expect(readPreparationFlag(["--click"], 0)).toBeUndefined()
    expect(readPreparationFlag(["--out", "x"], 0)).toBeUndefined()
  })
})

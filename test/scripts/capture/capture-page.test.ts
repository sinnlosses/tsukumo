import { describe, expect, test } from "vitest"

import { collectMisses } from "../../../scripts/capture/lib/capture-page.ts"
import type { Preparation } from "../../../scripts/capture/lib/capture-preparation.ts"

const click = (selector: string): Preparation => ({ kind: "click", selector })

/** `missing` のセレクタの手だけ当たらない。試した順を `tried` に残す。 */
function applier(missing: readonly string[]): {
  apply: (step: Preparation) => Promise<boolean>
  tried: string[]
} {
  const tried: string[] = []
  return {
    tried,
    apply: (step) => {
      if (step.kind === "click") {
        tried.push(step.selector)
        return Promise.resolve(!missing.includes(step.selector))
      }
      return Promise.resolve(true)
    },
  }
}

describe("collectMisses", () => {
  test("全部当たれば空", async () => {
    const { apply } = applier([])
    expect(await collectMisses([click("a"), click("b")], apply, "continue")).toEqual([])
  })

  test("continue は外れを控えて残りも試す", async () => {
    const { apply, tried } = applier(["b"])
    const missed = await collectMisses([click("a"), click("b"), click("c")], apply, "continue")
    expect(missed).toEqual([click("b")])
    expect(tried).toEqual(["a", "b", "c"])
  })

  test("stop は最初の外れで打ち切る", async () => {
    const { apply, tried } = applier(["b"])
    const missed = await collectMisses([click("a"), click("b"), click("c")], apply, "stop")
    expect(missed).toEqual([click("b")])
    expect(tried).toEqual(["a", "b"])
  })

  test("手が無ければ空", async () => {
    const { apply } = applier([])
    expect(await collectMisses([], apply, "stop")).toEqual([])
  })
})

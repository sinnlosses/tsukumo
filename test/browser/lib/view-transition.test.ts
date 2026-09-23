// 書き換えを移り変わりに載せるか・その場で行うかの分かれ目（`src/browser/lib/view-transition.ts`）。
// 移り変わりそのものの見え方はブラウザが描くので、ここでは「どちらの道を通ったか」だけを見る。

import { afterEach, describe, expect, it } from "bun:test"

import { withViewTransition } from "../../../src/browser/lib/view-transition.ts"

// happy-dom の `matchMedia` は `window` 自身が持っている（消すと戻らない）ので、差し替える前の
// ものを覚えておいて戻す。`startViewTransition` は happy-dom に無いので、消せば元どおり。
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia")

afterEach(() => {
  Reflect.deleteProperty(document, "startViewTransition")
  if (originalMatchMedia !== undefined) {
    Object.defineProperty(window, "matchMedia", originalMatchMedia)
  }
})

/** `document.startViewTransition` の代役。渡された書き換えは、テストが呼ぶまで走らない。 */
function stubStartViewTransition(): { readonly pending: (() => void)[] } {
  const pending: (() => void)[] = []
  Object.defineProperty(document, "startViewTransition", {
    configurable: true,
    value: (update: () => void) => {
      pending.push(update)
    },
  })
  return { pending }
}

/** 「動きを減らす」を選んでいるかを差し替える。 */
function stubReducedMotion(reduce: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({ matches: reduce }),
  })
}

describe("withViewTransition", () => {
  it("ブラウザが移り変わりを持たなければ、その場で1回書き換える", () => {
    let updates = 0

    withViewTransition(() => {
      updates += 1
    })

    expect(updates).toBe(1)
  })

  it("持っていれば、書き換えは移り変わりの中で走る", () => {
    const transition = stubStartViewTransition()
    stubReducedMotion(false)
    let updates = 0

    withViewTransition(() => {
      updates += 1
    })

    // ブラウザが「前」の絵を撮り終えるまでは書き換えない。
    expect(updates).toBe(0)
    expect(transition.pending).toHaveLength(1)
    transition.pending[0]?.()
    expect(updates).toBe(1)
  })

  it("動きを減らしていれば、移り変わりに載せずその場で書き換える", () => {
    const transition = stubStartViewTransition()
    stubReducedMotion(true)
    let updates = 0

    withViewTransition(() => {
      updates += 1
    })

    expect(updates).toBe(1)
    expect(transition.pending).toHaveLength(0)
  })
})

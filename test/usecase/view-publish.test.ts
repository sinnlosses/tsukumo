import { describe, expect, it } from "bun:test"

import { applySessionEvent, INITIAL_SESSION_STATE } from "../../src/protocol/session-state.ts"
import { createViewPublisher, type ViewRendering } from "../../src/usecase/view-publish.ts"

// フィクスチャはすべて手で書いた架空のやり取り（docs/coding-standards.md「会話内容の扱い」）。

function fakeRendering(overrides: Partial<ViewRendering> = {}): {
  readonly rendering: ViewRendering
  readonly published: { view: string; body: string }[]
} {
  const published: { view: string; body: string }[] = []
  const rendering: ViewRendering = {
    buildMainBody: (entries) => `main:${String(entries.length)}`,
    publish: (view, body) => published.push({ view, body }),
    ...overrides,
  }
  return { rendering, published }
}

describe("createViewPublisher", () => {
  it("メインビューを配る（サイドバーは段3、キャラビューは段5で React 側へ移った）", () => {
    const { rendering, published } = fakeRendering()
    const view = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "speech", text: "いくよ！", expression: "proud" },
      0,
    )
    const publish = createViewPublisher(rendering, () => {
      throw new Error("呼ばれないはず")
    })

    publish(view)

    expect(published).toEqual([{ view: "main", body: "main:0" }])
  })

  it("描く・配る側が失敗しても例外を外へ出さず、onFailure に諦めさせる", () => {
    let failed = 0
    const { rendering } = fakeRendering({
      buildMainBody: () => {
        throw new Error("描画に失敗した")
      },
    })
    const publish = createViewPublisher(rendering, () => {
      failed += 1
    })

    expect(() => publish(INITIAL_SESSION_STATE)).not.toThrow()
    expect(failed).toBe(1)
  })
})

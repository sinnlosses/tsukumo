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
    readCharacterAssets: (expression) => ({
      portrait: undefined,
      outfitAccent: undefined,
      altText: `alt:${expression}`,
    }),
    buildCharacterBody: (data) => `character:${data.speeches.join(",")}:${data.altText}`,
    buildMainBody: (entries) => `main:${String(entries.length)}`,
    publish: (view, body) => published.push({ view, body }),
    ...overrides,
  }
  return { rendering, published }
}

describe("createViewPublisher", () => {
  it("キャラビュー・メインビューの2つを配る（サイドバーは段3で React 側へ移った）", () => {
    const { rendering, published } = fakeRendering()
    const view = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "speech", text: "いくよ！", expression: "proud" },
      0,
    )
    const publish = createViewPublisher(
      rendering,
      () => 0,
      () => {
        throw new Error("呼ばれないはず")
      },
    )

    publish(view)

    expect(published).toEqual([
      { view: "character", body: "character:いくよ！:alt:proud" },
      { view: "main", body: "main:0" },
    ])
  })

  it("描く・配る側が失敗しても例外を外へ出さず、onFailure に諦めさせる", () => {
    let failed = 0
    const { rendering } = fakeRendering({
      buildMainBody: () => {
        throw new Error("描画に失敗した")
      },
    })
    const publish = createViewPublisher(
      rendering,
      () => 0,
      () => {
        failed += 1
      },
    )

    expect(() => publish(INITIAL_SESSION_STATE)).not.toThrow()
    expect(failed).toBe(1)
  })

  it("now() で渡した時刻を表情の判定に使う（作業中の遅延切り替え）", () => {
    const expressions: string[] = []
    const { rendering } = fakeRendering({
      readCharacterAssets: (expression) => {
        expressions.push(expression)
        return { portrait: undefined, outfitAccent: undefined, altText: "" }
      },
    })
    const view = applySessionEvent(
      INITIAL_SESSION_STATE,
      {
        kind: "tool-started",
        toolUseId: "toolu_1",
        name: "Read",
        input: {},
        parentToolUseId: undefined,
      },
      0,
    )
    const publish = createViewPublisher(
      rendering,
      () => 2000,
      () => {},
    )

    publish(view)

    expect(expressions).toEqual(["working"])
  })
})

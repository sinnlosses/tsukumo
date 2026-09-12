import { describe, expect, it } from "bun:test"

import { applySessionEvent, INITIAL_SESSION_VIEW } from "../../src/usecase/session-view.ts"
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
    buildSidebarBody: (data) => `sidebar:${String(data.activity.running.length)}`,
    publish: (view, body) => published.push({ view, body }),
    ...overrides,
  }
  return { rendering, published }
}

describe("createViewPublisher", () => {
  it("キャラビュー・メインビュー・サイドバーの3つを配る", () => {
    const { rendering, published } = fakeRendering()
    const view = applySessionEvent(
      INITIAL_SESSION_VIEW,
      { kind: "speech", text: "いくよ！", expression: "proud" },
      0,
    )
    const publish = createViewPublisher(
      rendering,
      () => undefined,
      () => 0,
      () => {
        throw new Error("呼ばれないはず")
      },
    )

    publish(view)

    expect(published).toEqual([
      { view: "character", body: "character:いくよ！:alt:proud" },
      { view: "main", body: "main:0" },
      { view: "sidebar", body: "sidebar:0" },
    ])
  })

  it("develop/tasks.json の読み係が返した値をサイドバーへそのまま渡す", () => {
    const captured: unknown[] = []
    const { rendering } = fakeRendering({
      buildSidebarBody: (data) => {
        captured.push(data.tasks)
        return "sidebar"
      },
    })
    const tasks = [{ id: "T-1", summary: "ダミーのタスク", status: "todo" }]
    const publish = createViewPublisher(
      rendering,
      () => tasks,
      () => 0,
      () => {},
    )

    publish(INITIAL_SESSION_VIEW)

    expect(captured).toEqual([tasks])
  })

  it("いま実行中のツールをサイドバーの activity に渡す", () => {
    const captured: unknown[] = []
    const { rendering } = fakeRendering({
      buildSidebarBody: (data) => {
        captured.push(data.activity)
        return "sidebar"
      },
    })
    const view = applySessionEvent(
      INITIAL_SESSION_VIEW,
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
      () => undefined,
      () => 0,
      () => {},
    )

    publish(view)

    expect(captured).toEqual([
      { running: [{ name: "Read", input: {}, nested: false }], finished: [] },
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
      () => undefined,
      () => 0,
      () => {
        failed += 1
      },
    )

    expect(() => publish(INITIAL_SESSION_VIEW)).not.toThrow()
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
      INITIAL_SESSION_VIEW,
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
      () => undefined,
      () => 2000,
      () => {},
    )

    publish(view)

    expect(expressions).toEqual(["working"])
  })
})

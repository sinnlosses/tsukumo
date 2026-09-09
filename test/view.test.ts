import { describe, expect, it } from "bun:test"

import {
  buildCharacterBody,
  buildIndexPage,
  buildPlaceholderBody,
  buildSidebarBody,
  buildViewPage,
  isViewName,
  type SidebarData,
  type SubagentActivity,
  VIEW_NAMES,
  viewEventPath,
  viewPath,
} from "../src/view.ts"

// meta.json が有る（ラベル付き）サブエージェントと、無い（ツール名だけの）サブエージェントを
// 両方含む、手で書いた架空のデータ。
const LABELED_ACTIVITY: SubagentActivity = {
  description: "架空のサイドバー実装",
  model: "sonnet",
  latestToolName: "Bash",
}
const UNLABELED_ACTIVITY: SubagentActivity = {
  description: undefined,
  model: undefined,
  latestToolName: "Edit",
}

// buildSidebarBody に渡す全部入りのデータ。個々のテストは必要な部分だけ上書きする。
const FULL_SIDEBAR_DATA: SidebarData = {
  contextTokens: 603_407,
  subagents: { pendingCount: 2, recentActivity: [LABELED_ACTIVITY, UNLABELED_ACTIVITY] },
  taskCounts: { done: 10, todo: 5 },
}

describe("ビューの経路", () => {
  it("ページと更新の経路が、ビューごとに別々になる", () => {
    const paths = VIEW_NAMES.map((view) => viewPath(view))
    const eventPaths = VIEW_NAMES.map((view) => viewEventPath(view))

    expect(new Set([...paths, ...eventPaths]).size).toBe(paths.length + eventPaths.length)
  })

  it("知らないビュー名を弾く", () => {
    expect(isViewName("character")).toBe(true)
    expect(isViewName("balloon")).toBe(false)
  })
})

describe("ビューのページ", () => {
  it("本文を埋め込み、そのビューの更新の経路を購読する", () => {
    const page = buildViewPage("character", "<p>こんにちは</p>")

    expect(page).toStartWith("<!doctype html>")
    expect(page).toContain("<p>こんにちは</p>")
    expect(page).toContain(`new EventSource("${viewEventPath("character")}")`)
  })

  it("一覧ページから3つのビューすべてに辿れる", () => {
    const page = buildIndexPage()

    for (const view of VIEW_NAMES) {
      expect(page).toContain(`href="${viewPath(view)}"`)
    }
  })
})

describe("ビューの本文", () => {
  it("発話をそのまま出さず、HTML として無害な形にして埋め込む", () => {
    const body = buildCharacterBody("［表情: 通常］", '<script>alert("x")</script>')

    expect(body).not.toContain("<script>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("発話がまだ無いときはプレースホルダを出す", () => {
    const body = buildCharacterBody("［表情: 通常］", undefined)

    expect(body).toContain("まだ発話がありません")
  })

  it("中身が未定のビューは、準備中であることだけを出す", () => {
    expect(buildPlaceholderBody("main")).toContain("準備中")
  })
})

describe("サイドバーの本文", () => {
  it("3つの区画（コンテキスト使用量・サブエージェント・タスクの進捗）を並べる", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("コンテキスト使用量")
    expect(body).toContain("サブエージェント")
    expect(body).toContain("タスクの進捗")
  })

  it("コンテキスト使用量は3桁区切りで出し、残量%は出さない", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("603,407")
    expect(body).not.toContain("%")
  })

  it("サブエージェントの保留件数を出す", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("2件")
  })

  it("meta.json のあるサブエージェントは、ラベル(description)・model・直近のツール名を1行で出す", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("<li>架空のサイドバー実装 (sonnet) — Bash</li>")
  })

  it("meta.json の無いサブエージェントは、列から消さずツール名だけで出す", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("<li>Edit</li>")
  })

  it("タスクの進捗は done / todo の件数を出す", () => {
    const body = buildSidebarBody(FULL_SIDEBAR_DATA)

    expect(body).toContain("10")
    expect(body).toContain("5")
  })

  it("直近の活動のラベル・ツール名を、HTML として無害な形にして埋め込む", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      subagents: {
        pendingCount: 1,
        recentActivity: [
          {
            description: '<script>alert("x")</script>',
            model: undefined,
            latestToolName: undefined,
          },
        ],
      },
    })

    expect(body).not.toContain("<script>")
    expect(body).toContain("&lt;script&gt;")
  })

  it("コンテキスト使用量が取れないとき、その区画だけ「不明」を出し、残りは壊れない", () => {
    const body = buildSidebarBody({ ...FULL_SIDEBAR_DATA, contextTokens: undefined })

    expect(body).toContain("不明")
    expect(body).toContain("10")
    expect(body).toContain("<li>Edit</li>")
  })

  it("pendingBackgroundAgentCount が1行も無い（保留件数が取れない）とき、その旨を出し、残りは壊れない", () => {
    const body = buildSidebarBody({
      ...FULL_SIDEBAR_DATA,
      subagents: { pendingCount: undefined, recentActivity: [] },
    })

    expect(body).toContain("不明")
    expect(body).toContain("直近の活動なし")
    expect(body).toContain("603,407")
  })

  it("develop/tasks.json が読めない（taskCounts が undefined）とき、その区画だけ「不明」を出し、残りは壊れない", () => {
    const body = buildSidebarBody({ ...FULL_SIDEBAR_DATA, taskCounts: undefined })

    expect(body).toContain("不明")
    expect(body).toContain("603,407")
    expect(body).toContain("<li>Edit</li>")
  })

  it("すべて取れないときも例外を投げずに組み立てる", () => {
    const body = buildSidebarBody({
      contextTokens: undefined,
      subagents: { pendingCount: undefined, recentActivity: [] },
      taskCounts: undefined,
    })

    expect(body).toContain("コンテキスト使用量")
    expect(body).toContain("サブエージェント")
    expect(body).toContain("タスクの進捗")
  })
})

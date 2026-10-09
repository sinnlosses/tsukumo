import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 雑談のサイドバー2段目「最近の話題」と3段目「覚えていること」（docs/architecture/screen-design.md「雑談のときのサイドバー」）。
// 場面 `chat-remembered-lines` は、3段目に短い1行とチップの表示幅（20字）を超える長い1行を、
// 2段目に短い話題と、空白を含まない長い語（日本語・英字）の話題を載せる。
//
// 「消す」で送る文面はどの同梱パックの `persona.md` にも無いので、受け口は一致を見つけず
// ホームの `characters/<pack>/` へ何も書かない（同梱パックを覆わない）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

const SHORT_LINE = "架空の1行"
const LONG_LINE = "架空の長い1行".repeat(5)

describe("雑談のサイドバーの「覚えていること」", () => {
  it("編集で × が出て、キャンセルは何も送らず、確認の「消す」で送る", async () => {
    const room = await run.open({
      scenario: "chat-remembered-lines-edit",
      scene: "chat-remembered-lines",
      viewport: "wide",
      domRoots: ["sidebar"],
    })

    await room.page.getByRole("button", { name: "編集", exact: true }).click()
    await room.page.getByRole("button", { name: `「${SHORT_LINE}」を消す` }).click()
    await room.page.getByRole("button", { name: "キャンセル", exact: true }).click()

    await room.page.getByRole("button", { name: `「${LONG_LINE}」を消す` }).click()
    await room.page.getByRole("button", { name: "消す", exact: true }).click()

    await room.page.getByRole("button", { name: "完了", exact: true }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("長い話題と長い覚えたことを出しても、2段目・3段目の入れ物は横に転がらない", async () => {
    const room = await run.open({
      scenario: "chat-sidebar-no-horizontal-scroll",
      scene: "chat-remembered-lines",
      viewport: "wide",
      domRoots: ["sidebar"],
    })

    await room.page.getByRole("list", { name: "最近の話題" }).waitFor()
    const overflows = await room.page.evaluate(() => {
      const body = document.querySelector('[class*="sidebar-chat-body_"]')
      if (body === null) throw new Error("雑談のサイドバーの入れ物が無い")
      const containers = body.querySelectorAll(
        '[class*="sidebar-block_"], [class*="sidebar-block-head_"], [class*="sidebar-block-scroll_"]',
      )
      return [body, ...containers].map((el) => el.scrollWidth - el.clientWidth)
    })

    expect(overflows.length).toBeGreaterThan(1)
    expect(Math.max(...overflows)).toBeLessThanOrEqual(0)
  })
})

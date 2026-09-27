import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 雑談のサイドバー3段目「覚えていること」（docs/screen-design.md「雑談のときのサイドバー」）。
// 場面 `chat-remembered-lines` は、短い1行とチップの表示幅（20字）を超える長い1行を載せる。
//
// チップの開閉は「編集」を押すと `openLine` ごと初期化されるので（`PersonaMemorySection`）、
// 開閉だけを別のシナリオで撮る（同じ流れの中に混ぜると、あとの「編集」が開閉の結果を初期化して
// 揉み消してしまう）。
//
// 「消す」で送る文面はどの同梱パックの `persona.md` にも無いので、受け口は一致を見つけず
// ホームの `characters/<pack>/` へ何も書かない（同梱パックを覆わない）。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

const SHORT_LINE = "架空の1行"
const LONG_LINE = "架空の長い1行".repeat(5)

/** 開いていないときのチップの読み上げ名（先頭20字 + `…`）。 */
const LONG_CHIP_NAME = new RegExp(`^${LONG_LINE.slice(0, 20)}…$`)

describe("雑談のサイドバーの「覚えていること」", () => {
  it("チップを押すと全文が開く", async () => {
    const room = await run.open({
      scenario: "chat-remembered-lines-open",
      scene: "chat-remembered-lines",
      viewport: "wide",
    })

    await room.page.getByRole("button", { name: LONG_CHIP_NAME }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("チップをもう一度押すと閉じる", async () => {
    const room = await run.open({
      scenario: "chat-remembered-lines-closed",
      scene: "chat-remembered-lines",
      viewport: "wide",
    })

    await room.page.getByRole("button", { name: LONG_CHIP_NAME }).click()
    await room.page.getByRole("button", { name: LONG_LINE, exact: true }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("編集で × が出て、キャンセルは何も送らず、確認の「消す」で送る", async () => {
    const room = await run.open({
      scenario: "chat-remembered-lines-edit",
      scene: "chat-remembered-lines",
      viewport: "wide",
    })

    await room.page.getByRole("button", { name: "編集", exact: true }).click()
    await room.page.getByRole("button", { name: `「${SHORT_LINE}」を消す` }).click()
    await room.page.getByRole("button", { name: "キャンセル", exact: true }).click()

    await room.page.getByRole("button", { name: `「${LONG_LINE}」を消す` }).click()
    await room.page.getByRole("button", { name: "消す", exact: true }).click()

    await room.page.getByRole("button", { name: "完了", exact: true }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })
})

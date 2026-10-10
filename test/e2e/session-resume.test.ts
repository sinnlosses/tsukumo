import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 続きから開く（docs/architecture/testing.md「E2E のシナリオの一覧」）。起動は常に新規なので、
// 疑似セッションの場面 `session-resume` が切り替え先に出す過去の transcript を、
// 切り替え画面から選んで開く。選ぶと組み直した履歴が `hello` に載る。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("続きから開く", () => {
  it("切り替え画面から前のセッションを選ぶと、そのやり取りがメインビューに出る", async () => {
    const room = await run.open({
      scenario: "session-resume",
      scene: "session-resume",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.page.getByRole("button", { name: /押すとセッションを切り替える画面を開く/u }).click()
    const search = room.page.getByRole("combobox", { name: "セッションを探す" })
    await search.waitFor()
    await search.press("ArrowDown")
    await search.press("Enter")
    await room.settleAndMatch(ELAPSED_MS)
  })
})

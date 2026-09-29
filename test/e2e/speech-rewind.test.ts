import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 仕事モードで、吹き出し・セリフのログの行を押すと立ち絵がその表情へ遡る
// （docs/architecture/testing.md「E2E のシナリオの一覧」・docs/architecture/screen-design.md「会話を遡る」）。
// `question-multi`（3つのセリフが表情違いで並ぶ場面）を借り、いちばん新しくない行を押す。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** 場面 `question-multi` の、最新ではない2つ目のセリフ（表情 `thinking`）。 */
const OLDER_SPEECH = "選ぶのを待っている間の、架空のひとこと。"

describe("会話を遡る（仕事モード）", () => {
  it("吹き出しを押すと、そのセリフの表情へ立ち絵が遡る", async () => {
    const room = await run.open({
      scenario: "speech-rewind-balloon",
      scene: "question-multi",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("turn-finished")
    await room.page.getByRole("button", { name: OLDER_SPEECH, exact: true }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("セリフのログの行を押すと、ログの床の立ち絵がその表情になる", async () => {
    const room = await run.open({
      scenario: "speech-rewind-log",
      scene: "question-multi",
      viewport: "wide",
      domRoots: ["character", "speech-log"],
    })

    await room.waitForEvent("turn-finished")
    await room.page.getByRole("button", { name: "ログ" }).click()
    await room.page
      .locator("dialog")
      .getByRole("button", { name: OLDER_SPEECH, exact: true })
      .click()
    await room.settleAndMatch(ELAPSED_MS)
  })
})

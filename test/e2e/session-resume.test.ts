import type { Locator, Page } from "playwright-core"
import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 続きから開く（docs/architecture/testing.md「E2E のシナリオの一覧」）。疑似セッションの場面
// `session-resume` は過去の transcript を続きとして持ち、起こした時点で組み直した履歴が
// `hello` に載る。場面自身は何も流さないので、開いた直後の姿をそのまま撮る。
// おかえりの場面は、前回の最後の report に待ちの一言を持つ transcript と持たない transcript を続きにする。
// 疑似セッションは挨拶を書かせないので、書けた挨拶は場面が `welcome-greeting-changed` で流す。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** 前回の transcript の最後の report に書いた待ちの一言。 */
const PREVIOUS_WAITING_LINE = "おかえり。前回の架空の待ちの一言だよ。"

function characterView(page: Page): Locator {
  return page.locator('[data-region="character"]')
}

describe("続きから開く", () => {
  it("前のセッションのやり取りがメインビューに出る", async () => {
    const room = await run.open({
      scenario: "session-resume",
      scene: "session-resume",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.settleAndMatch(ELAPSED_MS)
  })

  it("前回の最後のターンに待ちの一言があれば、それをおかえりとして最新に出す", async () => {
    const room = await run.open({
      scenario: "session-resume-waiting-line",
      scene: "session-resume-waiting-line",
      viewport: "wide",
      domRoots: ["character"],
    })

    await characterView(room.page).getByText(PREVIOUS_WAITING_LINE).waitFor()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("待ちの一言が無ければ、迎えの挨拶の札なしの文をおかえりとして出す", async () => {
    const room = await run.open({
      scenario: "session-resume-welcome-back",
      scene: "session-resume-welcome-back",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("welcome-greeting-changed")
    await characterView(room.page).getByText("おかえり、また会えたね。架空の挨拶。").waitFor()
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("依頼が届くと、おかえりは消える", async () => {
    const room = await run.open({
      scenario: "session-resume-request",
      scene: "session-resume-request",
      viewport: "wide",
      domRoots: ["character"],
    })

    await characterView(room.page).getByText(PREVIOUS_WAITING_LINE).waitFor()
    await room.waitForEvent("request")
    await characterView(room.page).getByText(PREVIOUS_WAITING_LINE).waitFor({ state: "hidden" })
    await room.settleAndMatch(ELAPSED_MS)
  })
})

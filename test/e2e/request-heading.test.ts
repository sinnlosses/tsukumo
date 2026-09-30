import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 札の頭の依頼の続き。疑似セッションの場面 `request-heading` は、1行・引用の記号で始まる2行・6行の
// 依頼を続けて流す。撮るのは最新（6行）の頭で、続きは2行まで出て「ほか 3 行」で開く。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

/** `request-heading` が流す `turn-finished` の回数（3つのやり取り）。 */
const LAST_TURN_FINISHED_OCCURRENCE = 3

describe("札の頭の依頼の続き", () => {
  it("3行目からは「ほか n 行」に畳まれ、続きは見出しの下に2行だけ出る", async () => {
    const room = await run.open({
      scenario: "request-heading-folded",
      scene: "request-heading",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished", LAST_TURN_FINISHED_OCCURRENCE)
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("「ほか n 行」を押すと続きがすべて出て、ボタンは消える", async () => {
    const room = await run.open({
      scenario: "request-heading-open",
      scene: "request-heading",
      viewport: "wide",
      domRoots: ["main"],
    })

    await room.waitForEvent("turn-finished", LAST_TURN_FINISHED_OCCURRENCE)
    await room.page.getByRole("button", { name: "ほか 3 行" }).click()
    await room.settleAndMatch(ELAPSED_MS)
  })
})

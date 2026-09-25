import { describe, it } from "bun:test"

import { useScenarioRun } from "./scenario-run.ts"

// 雑談の切り替えと忘却の区切り（docs/design.md 10章「E2E のシナリオの一覧」）。疑似セッションの
// 場面 `chat-compact-boundary` は、圧縮の区切り（claude 自身の自動の圧縮で起きる
// `compact-boundary`）をまたいで2つのやり取りを流す。区切りより前後どちらのやり取りも
// 履歴に残ることを、`turn-finished` まで待ってから撮る。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("雑談の切り替えと忘却の区切り", () => {
  it("圧縮の区切りをまたいでも、前後のやり取りがどちらも履歴に残る", async () => {
    const room = await run.open({
      scenario: "chat-compact-boundary",
      scene: "chat-compact-boundary",
      viewport: "wide",
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatch(ELAPSED_MS)
  })
})

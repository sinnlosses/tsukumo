import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 雑談の切り替えと忘却の区切り（docs/architecture/testing.md「E2E のシナリオの一覧」）。疑似セッションの
// 場面 `chat-compact-boundary` は、圧縮の区切り（claude 自身の自動の圧縮で起きる
// `compact-boundary`）をまたいで2つのやり取りを流す。区切りより前後どちらのやり取りも
// 履歴に残ることを、`turn-finished` まで待ってから撮る。
//
// サイドバーの下端の使用量の目盛りは手続き（`/rpc`）の応答で描かれ、React Query はその知らせを
// タイマーで配るので、凍らせた時計のままだと「取得中…」で止まることがある。目盛りがそのターンの後に
// 取った値を出すまで時計を進めて撮る。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("雑談の切り替えと忘却の区切り", () => {
  it("圧縮の区切りをまたいでも、前後のやり取りがどちらも履歴に残る", async () => {
    const room = await run.open({
      scenario: "chat-compact-boundary",
      scene: "chat-compact-boundary",
      viewport: "wide",
      domRoots: ["page"],
    })

    await room.revealUsageAfterTurn(1)
    await room.settleAndMatch(ELAPSED_MS)
  })
})

import { test } from "./room-fixture.ts"

// 雑談の切り替えと忘却の区切り（docs/architecture/testing.md「E2E のシナリオの一覧」）。疑似セッションの
// 場面 `chat-compact-boundary` は、圧縮の区切り（claude 自身の自動の圧縮で起きる
// `compact-boundary`）をまたいで2つのやり取りを流す。区切りより前後どちらのやり取りも
// 履歴に残ることを、`turn-finished` まで待ってから紙だけを撮る
// （部屋の右上の「文脈 n%」は手続きの応答で描かれ、撮る時点で揺れるので写さない）。

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

test.describe("雑談の切り替えと忘却の区切り", () => {
  test("圧縮の区切りをまたいでも、前後のやり取りがどちらも履歴に残る", async ({ run }) => {
    const room = await run.open({
      scenario: "chat-compact-boundary",
      scene: "chat-compact-boundary",
      viewport: "wide",
      domRoots: ["paper"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })
})

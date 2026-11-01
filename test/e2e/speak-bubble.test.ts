import { test } from "./room-fixture.ts"

// speak → キャラビューの吹き出し（docs/architecture/testing.md「E2E のシナリオの一覧」）。`speech` イベントが
// キャラビューの吹き出し（`<Balloon>`、`data-latest`）に積まれることを、場面 `closing-narration-quick`
// （締めの一言が最終レポートの後ろに続く）で確かめる。

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

test.describe("speak → キャラビューの吹き出し", () => {
  test("締めの speak が最終レポートのあとに続く吹き出しとして残る", async ({ run }) => {
    const room = await run.open({
      scenario: "speak-bubble-closing-narration",
      scene: "closing-narration-quick",
      viewport: "wide",
      domRoots: ["character"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })
})

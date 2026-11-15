import { test } from "./room-fixture.ts"

// speak → 狭い画面の顔の吹き出し（docs/architecture/testing.md「E2E のシナリオの一覧」）。`speech` イベントの
// 最新の1件が顔の吹き出しに出ることを、場面 `closing-narration-quick`（締めの一言が最終レポートの後ろに続く）で確かめる。
// 広い画面のキャラビューは吹き出しを持たず、セリフは会話の流れに出る。

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

test.describe("speak → 狭い画面の顔の吹き出し", () => {
  test("締めの speak が最終レポートのあとに続く最新の吹き出しとして出る", async ({ run }) => {
    const room = await run.open({
      scenario: "speak-bubble-closing-narration",
      scene: "closing-narration-quick",
      viewport: "narrow",
      domRoots: ["character"],
    })

    await room.waitForEvent("turn-finished")
    await room.settleAndMatchPicked(ELAPSED_MS)
  })
})

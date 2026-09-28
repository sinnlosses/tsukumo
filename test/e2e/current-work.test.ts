import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// ツールの実行といまの作業（docs/architecture/testing.md「E2E のシナリオの一覧」）。疑似セッションの
// 場面 `long-tool` は 20 秒走るので、`tool-started` を待って撮り、流れ切るのを待たない
// （同章「E2E の走らせ方」）。撮るのはツールが走っているあいだ、帯の「いまの作業」に
// 実行中のツールが出ている状態。
//
// 場面 `long-report-drafting` は `report-drafting` のあと 20 秒近く `report` が届かないので、
// `report-drafting` を待って撮り、流れ切るのを待たない。撮るのはメインが report の引数を
// 書いている途中、帯の「いまの作業」に「レポートを書いています」が出ている状態。

const run = useScenarioRun()

/** 撮るときの経過（凍らせた瞬間から）。「何秒前」の類いをこの値で揃える。 */
const ELAPSED_MS = 60_000

describe("ツールの実行といまの作業", () => {
  it("ツールが走っているあいだ、帯の「いまの作業」に実行中のツールが出る", async () => {
    const room = await run.open({
      scenario: "current-work-long-tool",
      scene: "long-tool",
      viewport: "wide",
    })

    await room.waitForEvent("tool-started")
    await room.settleAndMatch(ELAPSED_MS)
  })

  it("メインが report の引数を書いているあいだ、帯の「いまの作業」に「レポートを書いています」が出る", async () => {
    const room = await run.open({
      scenario: "current-work-report-drafting",
      scene: "long-report-drafting",
      viewport: "wide",
    })

    await room.waitForEvent("report-drafting")
    await room.settleAndMatch(ELAPSED_MS)
  })
})

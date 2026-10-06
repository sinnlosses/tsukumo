import { expect, describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 会話が終わったあとの入力欄（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `ended-ready` で起こして依頼を送ると、次の場面 `session-ended` が `session-ended` を流す。
// 帯に終了の旨と「新しく始める」の口が出て送信が塞がれ、口を押すと起こし直されて帯が消える。

const run = useScenarioRun()

const ELAPSED_MS = 60_000

describe("会話が終わったあとの入力欄", () => {
  it("送るボタンが無効になり、口を押すと起こし直されて帯が消え、送るボタンが戻る", async () => {
    const room = await run.open({
      scenario: "session-ended-restart",
      scene: "ended-ready",
      viewport: "wide",
      domRoots: ["main", "dispatch"],
    })

    const textArea = room.page.locator("textarea")
    await textArea.fill("終わる会話への依頼（架空の依頼）")
    await textArea.press("Meta+Enter")
    await room.waitForEvent("session-ended")
    const restart = room.page.getByRole("button", { name: "新しく始める" })
    await restart.waitFor()
    expect(await room.page.locator('button[type="submit"]').isDisabled()).toBe(true)
    await restart.click()

    await restart.waitFor({ state: "detached" })
    await expect.poll(() => room.page.locator('button[type="submit"]').isDisabled()).toBe(false)
    await room.settleAndMatch(ELAPSED_MS)
  })
})

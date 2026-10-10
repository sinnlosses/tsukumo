import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"

// 見直しの結果を受け付けた会話のやり取りの導線（docs/architecture/testing.md「E2E のシナリオの一覧」）。
// 場面 `usage-review-result` は、結果を受け付けたやり取りと、受け付けていないやり取りを順に流す。

const run = useScenarioRun()

describe("見直しの結果の導線", () => {
  it("受け付けたやり取りにだけ出て、押すとトークンの画面で結果の札が開く", async () => {
    const room = await run.open({
      scenario: "usage-review-link",
      scene: "usage-review-result",
      viewport: "medium",
      domRoots: [],
    })
    const main = room.page.locator('[data-region="main"]')
    await main.getByText("見直しを受け付けていないターンの結論。").waitFor()
    expect(await main.getByRole("link", { name: "結果を開く" }).count()).toBe(0)

    await room.page.evaluate(() => {
      window.location.hash = "#?turn=0"
    })
    const link = main.getByRole("link", { name: "結果を開く" })
    await link.waitFor()
    await link.click()

    await room.page.getByText("架空のツールの結果が大きい").waitFor()
    expect(new URL(room.page.url()).hash).toMatch(/^#token-usage\?review=last/)
  })
})

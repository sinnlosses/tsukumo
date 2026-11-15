import { expect, test } from "./room-fixture.ts"
import { LONG_TOOL_OCCURRENCE, phaseStates, stripOf } from "./work-strip-probe.ts"

// 進み具合のプログレスバーの段の丸（場面は `work-strip-running`）。

test.describe("進み具合のプログレスバーのフェーズの丸", () => {
  test("済んだ段の丸を押すと吹き出しは出ず、依頼の手順の一覧が全フェーズの行つきで開く", async ({
    run,
  }) => {
    const room = await run.open({
      scenario: "work-strip-phase-jump",
      scene: "work-strip-running",
      viewport: "large",
      domRoots: ["main"],
    })
    const strip = stripOf(room.page)
    await room.waitForEvent("tool-started", LONG_TOOL_OCCURRENCE)
    await expect.poll(() => phaseStates(strip)).toEqual(["done", "current", "upcoming", "upcoming"])

    await strip.getByRole("button", { name: /今の形を調べる/ }).click()

    const list = strip.getByRole("region", { name: "依頼の手順" })
    await list.waitFor()
    expect(await strip.getByRole("dialog").count()).toBe(0)
    expect(await list.locator("li[data-phase-state]").count()).toBe(4)
  })
})

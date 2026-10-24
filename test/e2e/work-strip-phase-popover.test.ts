import { describe, expect, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { LONG_TOOL_OCCURRENCE, phaseStates, stripOf } from "./work-strip-probe.ts"

// 進み具合の帯の段の吹き出し（場面は `work-strip-running`）。

const run = useScenarioRun()

describe("進み具合の帯の段の吹き出し", () => {
  it("済んだ段の丸を押すと吹き出しが出て、「この段の手順へ」で依頼の手順の一覧が開く", async () => {
    const room = await run.open({
      scenario: "work-strip-phase-popover",
      scene: "work-strip-running",
      viewport: "large",
      domRoots: ["main"],
    })
    const strip = stripOf(room.page)
    await room.waitForEvent("tool-started", LONG_TOOL_OCCURRENCE)
    await expect.poll(() => phaseStates(strip)).toEqual(["done", "current", "upcoming", "upcoming"])

    await strip.getByRole("button", { name: /今の形を調べる/ }).click()
    const popover = strip.getByRole("dialog")
    await popover.waitFor()
    expect(await popover.textContent()).toContain("済み · 所要")
    await popover.getByRole("button", { name: "この段の手順へ" }).click()

    await strip.getByRole("region", { name: "依頼の手順" }).waitFor()
    expect(await strip.getByRole("dialog").count()).toBe(0)
  })
})

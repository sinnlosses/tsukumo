import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { expectBlockGapsOnGrid, spacingScenario } from "./spacing-grid.ts"

const run = useScenarioRun()

describe("レポートの塊のあき", () => {
  it.each(["notation", "long-report-quick", "report-chart", "report-blocks"])(
    "本文の隣り合う塊のあきが 12px の倍数になる（%s）",
    async (scene) => {
      const room = await run.open(spacingScenario(scene))
      await room.waitForEvent("turn-finished")
      await expectBlockGapsOnGrid(room.page)
    },
  )
})

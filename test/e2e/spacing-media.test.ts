import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { expectBlockGapsOnGrid, spacingScenario } from "./spacing-grid.ts"

const run = useScenarioRun()

describe("レポートの塊のあき（図表）", () => {
  it.each(["report-caption", "report-matrix", "report-dimension", "report-svg"])(
    "本文の隣り合う塊のあきが 13px の倍数になる（%s）",
    async (scene) => {
      const room = await run.open(spacingScenario(scene))
      await room.waitForEvent("turn-finished")
      await expectBlockGapsOnGrid(room.page)
    },
  )
})

import { describe, it } from "vitest"

import { useScenarioRun } from "./scenario-run.ts"
import { expectBlockGapsOnGrid, spacingScenario } from "./spacing-grid.ts"

const run = useScenarioRun()

describe("レポートの塊のあき（判定）", () => {
  it.each(["report-before-after", "report-task-verdict", "report-meter"])(
    "本文の隣り合う塊のあきが 12px の倍数になる（%s）",
    async (scene) => {
      const room = await run.open(spacingScenario(scene))
      await room.waitForEvent("turn-finished")
      await expectBlockGapsOnGrid(room.page)
    },
  )
})

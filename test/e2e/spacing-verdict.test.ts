import { test } from "./room-fixture.ts"
import { expectBlockGapsOnGrid, spacingScenario } from "./spacing-grid.ts"

test.describe("レポートの塊のあき（判定）", () => {
  for (const scene of ["report-before-after", "report-task-verdict", "report-meter"]) {
    test(`本文の隣り合う塊のあきが 12px の倍数になる（${scene}）`, async ({ run }) => {
      const room = await run.open(spacingScenario(scene))
      await room.waitForEvent("turn-finished")
      await expectBlockGapsOnGrid(room.page)
    })
  }
})

import { test } from "./room-fixture.ts"
import { expectBlockGapsOnGrid, spacingScenario } from "./spacing-grid.ts"

test.describe("レポートの塊のあき", () => {
  for (const scene of ["notation", "long-report-quick", "report-chart", "report-blocks"]) {
    test(`本文の隣り合う塊のあきが 12px の倍数になる（${scene}）`, async ({ run }) => {
      const room = await run.open(spacingScenario(scene))
      await room.waitForEvent("turn-finished")
      await expectBlockGapsOnGrid(room.page)
    })
  }
})

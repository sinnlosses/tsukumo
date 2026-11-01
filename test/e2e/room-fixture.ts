import { test as base } from "@playwright/test"

import { openRoom, type ScenarioOptions, type ScenarioRoom } from "./scenario-open.ts"
import type { ScenarioRun } from "./scenario-run.ts"

type RoomFixtures = {
  readonly run: ScenarioRun
}

// openRoom の後始末は、積んだ順の逆に走らせる前提（コンテキスト → tsukumo → 一時のディレクトリ）
export const test = base.extend<RoomFixtures>({
  run: async ({ browser }, use, testInfo) => {
    const cleanups: (() => Promise<void>)[] = []
    const run: ScenarioRun = {
      open: (options: ScenarioOptions): Promise<ScenarioRoom> =>
        openRoom(
          browser,
          options,
          (cleanup) => cleanups.push(cleanup),
          () => testInfo.status !== testInfo.expectedStatus,
        ),
    }
    try {
      await use(run)
    } finally {
      for (const cleanup of cleanups.splice(0).toReversed()) {
        await cleanup()
      }
    }
  },
})

export { expect } from "@playwright/test"
export { VIEWPORTS } from "./scenario-viewport.ts"

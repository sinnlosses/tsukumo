import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"

import { test as base } from "@playwright/test"

import { waitForViewUrl } from "../../scripts/shared/fake-tsukumo-process.ts"
import { makeTempDirectory, spawnTsukumo, stopTsukumo } from "../e2e/tsukumo-process.ts"

const LAUNCH_TIMEOUT_MS = 15_000

type TsukumoFixtures = {
  readonly viewUrl: string
}

export const test = base.extend<TsukumoFixtures>({
  // oxlint-disable-next-line no-empty-pattern -- Playwright は第1引数が分割代入であることを要る
  viewUrl: async ({}, use) => {
    const home = makeTempDirectory("tsukumo-trial-home-")
    const cwd = makeTempDirectory("tsukumo-trial-cwd-")
    const userHome = makeTempDirectory("tsukumo-trial-user-home-")
    const projectDirectory = path.join(cwd.real, "trial-project")
    mkdirSync(projectDirectory)
    const child = spawnTsukumo("report-blocks", home.real, userHome.real, projectDirectory)
    try {
      await use(await waitForViewUrl(child, home.real, LAUNCH_TIMEOUT_MS))
    } finally {
      await stopTsukumo(child)
      for (const directory of [home, cwd, userHome]) {
        rmSync(directory.real, { recursive: true, force: true })
      }
    }
  },
})

export { expect } from "@playwright/test"

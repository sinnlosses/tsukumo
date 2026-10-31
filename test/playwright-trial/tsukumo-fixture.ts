import { mkdirSync, rmSync } from "node:fs"
import path from "node:path"

import { test as base } from "@playwright/test"

import { waitForViewUrl } from "../../scripts/shared/fake-tsukumo-process.ts"
import { makeTempDirectory, spawnTsukumo, stopTsukumo } from "../e2e/tsukumo-process.ts"

const LAUNCH_TIMEOUT_MS = 15_000

// ヘッダの部屋の名前にポート番号が写るので、回ごとに変わらないよう固定する
const FIXED_VIEW_PORT = 47_831

type TsukumoFixtures = {
  readonly scene: string
  readonly viewUrl: string
}

export const test = base.extend<TsukumoFixtures>({
  scene: ["report-blocks", { option: true }],
  viewUrl: async ({ scene }, use) => {
    const home = makeTempDirectory("tsukumo-trial-home-")
    const cwd = makeTempDirectory("tsukumo-trial-cwd-")
    const userHome = makeTempDirectory("tsukumo-trial-user-home-")
    const projectDirectory = path.join(cwd.real, "trial-project")
    mkdirSync(projectDirectory)
    const child = spawnTsukumo(scene, home.real, userHome.real, projectDirectory, FIXED_VIEW_PORT)
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

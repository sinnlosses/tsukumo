// E2E 全体で共有するヘッドレス Chrome を1回だけ起こし、`wsEndpoint` を配る。

import process from "node:process"

import type { TestProject } from "vitest/node"

import { CHROME_ENDPOINT_KEY, launchChromeServer } from "./e2e/chrome-launch.ts"

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const server = await launchChromeServer()
  process.stderr.write("[e2e-chrome-setup] Chrome を起こした\n")
  project.provide(CHROME_ENDPOINT_KEY, server.wsEndpoint())
  return async () => {
    await server.kill()
  }
}

declare module "vitest" {
  export interface ProvidedContext {
    chromeEndpoint: string
  }
}

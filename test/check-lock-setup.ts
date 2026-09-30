// 単体テストと E2E のどちらを直に走らせても、check と同じ作業ツリーをまたぐ錠を通す。
// watch では teardown が終了時にしか呼ばれず錠を持ちっぱなしにするので、取らない。

import { fileURLToPath } from "node:url"

import type { TestProject } from "vitest/node"

import { acquireCheckLockUnlessHeld } from "../scripts/lib/check-lock-repository.ts"

const ROOT = fileURLToPath(new URL("..", import.meta.url))

export default async function setup(project: TestProject): Promise<(() => void) | undefined> {
  if (project.vitest.config.watch) {
    return undefined
  }
  return acquireCheckLockUnlessHeld(ROOT, process.env)
}

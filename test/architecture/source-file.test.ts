import { mkdirSync, rmSync, writeFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { listSourceFiles } from "./source-file.ts"

describe("listSourceFiles", () => {
  it("test/e2e/output/ の生成物には下りない", () => {
    const directory = `${REPOSITORY_ROOT}/test/e2e/output/source-file-test-probe`
    mkdirSync(directory, { recursive: true })
    writeFileSync(`${directory}/probe.ts`, "")
    try {
      const files = listSourceFiles(`${REPOSITORY_ROOT}/test`)
      expect(files.some((relPath) => relPath.startsWith("e2e/output/"))).toBe(false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

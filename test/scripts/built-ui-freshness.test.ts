import { utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { assertBuiltUiFresh } from "../../scripts/lib/built-ui-freshness.ts"
import { useTempDir } from "../fixture/temp-dir.ts"

const FAR_FUTURE_SECONDS = 4_000_000_000

describe("組み立て済みのブラウザ側の鮮度", () => {
  const tempDir = useTempDir("built-ui-freshness")

  function writePair(modifiedAtSeconds: number): void {
    for (const name of ["ui.js", "main.css"]) {
      const path = join(tempDir(), name)
      writeFileSync(path, "")
      utimesSync(path, modifiedAtSeconds, modifiedAtSeconds)
    }
  }

  test("ソースより新しければ通る", async () => {
    writePair(FAR_FUTURE_SECONDS)

    await expect(assertBuiltUiFresh(tempDir())).resolves.toBeUndefined()
  })

  test("ソースより古ければ pnpm run build を促して落ちる", async () => {
    writePair(0)

    await expect(assertBuiltUiFresh(tempDir())).rejects.toThrow("pnpm run build")
  })

  test("対が無ければ pnpm run build を促して落ちる", async () => {
    await expect(assertBuiltUiFresh(tempDir())).rejects.toThrow("pnpm run build")
  })
})

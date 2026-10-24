import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { isBuiltUiCurrent, recordBuildInputs } from "../../../../scripts/dev/lib/build-ui-skip.ts"
import {
  SOURCE_FINGERPRINT_FILE_NAME,
  bundledSourceFingerprint,
} from "../../../../src/server/view-server/adapter/bundle.ts"
import { useTempDir } from "../../../fixture/temp-dir.ts"

describe("入力が同じ組み立ての省略", () => {
  const tempDir = useTempDir("build-ui-skip")
  const builtDir = () => join(tempDir(), "built")
  const root = () => join(tempDir(), "root")

  async function writeBuilt(): Promise<void> {
    mkdirSync(builtDir(), { recursive: true })
    mkdirSync(root(), { recursive: true })
    for (const name of ["ui.js", "main.css"]) {
      writeFileSync(join(builtDir(), name), "")
    }
    writeFileSync(
      join(builtDir(), SOURCE_FINGERPRINT_FILE_NAME),
      (await bundledSourceFingerprint()) ?? "",
    )
    for (const name of ["vite.config.ts", "pnpm-lock.yaml", "tsconfig.json"]) {
      writeFileSync(join(root(), name), `${name} 前回`)
    }
    await recordBuildInputs(builtDir(), root())
  }

  test("ソースも入力ファイルも前回と同じなら、組み立て直さない", async () => {
    await writeBuilt()

    await expect(isBuiltUiCurrent(builtDir(), root())).resolves.toBe(true)
  })

  test.each(["vite.config.ts", "pnpm-lock.yaml", "tsconfig.json"])(
    "%s が変わったら組み立てる",
    async (name) => {
      await writeBuilt()
      writeFileSync(join(root(), name), "変えた")

      await expect(isBuiltUiCurrent(builtDir(), root())).resolves.toBe(false)
    },
  )

  test("ソースの指紋が違う・入力の指紋が無い・成果物が無いなら組み立てる", async () => {
    await expect(isBuiltUiCurrent(builtDir(), root())).resolves.toBe(false)

    await writeBuilt()
    writeFileSync(join(builtDir(), SOURCE_FINGERPRINT_FILE_NAME), "別のソース")
    await expect(isBuiltUiCurrent(builtDir(), root())).resolves.toBe(false)

    await writeBuilt()
    writeFileSync(join(builtDir(), "build-input-fingerprint.txt"), "")
    await expect(isBuiltUiCurrent(builtDir(), root())).resolves.toBe(false)
  })
})

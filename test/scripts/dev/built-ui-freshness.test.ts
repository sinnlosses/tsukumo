import { utimesSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, test } from "vitest"

import { assertBuiltUiFresh } from "../../../scripts/dev/lib/built-ui-freshness.ts"
import { bundledSourceFingerprint } from "../../../src/server/view-server/adapter/bundle.ts"
import { useTempDir } from "../../fixture/temp-dir.ts"

const FAR_FUTURE_SECONDS = 4_000_000_000

/** 組み立てたときのソースの指紋を置くファイル（`SOURCE_FINGERPRINT_FILE_NAME`）。 */
const SOURCE_FINGERPRINT_FILE_NAME = "source-fingerprint.txt"

describe("組み立て済みのブラウザ側の鮮度", () => {
  const tempDir = useTempDir("built-ui-freshness")

  function writePair(modifiedAtSeconds: number): void {
    for (const name of ["ui.js", "main.css"]) {
      const path = join(tempDir(), name)
      writeFileSync(path, "")
      utimesSync(path, modifiedAtSeconds, modifiedAtSeconds)
    }
  }

  function writeFingerprint(fingerprint: string, modifiedAtSeconds: number): void {
    const path = join(tempDir(), SOURCE_FINGERPRINT_FILE_NAME)
    writeFileSync(path, fingerprint)
    utimesSync(path, modifiedAtSeconds, modifiedAtSeconds)
  }

  test("いまのソースの指紋なら、成果物の更新時刻が古くても通る", async () => {
    writePair(0)
    writeFingerprint((await bundledSourceFingerprint()) ?? "", 0)

    await expect(assertBuiltUiFresh(tempDir())).resolves.toBeUndefined()
  })

  test("指紋がソースと違えば、成果物の更新時刻が新しくても pnpm run build を促して落ちる", async () => {
    writePair(FAR_FUTURE_SECONDS)
    writeFingerprint("組み立てたあとにソースが変わった", FAR_FUTURE_SECONDS)

    await expect(assertBuiltUiFresh(tempDir())).rejects.toThrow("pnpm run build")
  })

  test("指紋が無ければ、成果物の更新時刻が新しくても pnpm run build を促して落ちる", async () => {
    writePair(FAR_FUTURE_SECONDS)

    await expect(assertBuiltUiFresh(tempDir())).rejects.toThrow("pnpm run build")
  })

  test("対が無ければ pnpm run build を促して落ちる", async () => {
    await expect(assertBuiltUiFresh(tempDir())).rejects.toThrow("pnpm run build")
  })
})

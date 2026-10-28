import { existsSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import {
  PENDING_READERS,
  pendingBrowserReaderFiles,
  pendingProductionExports,
  type PendingReader,
} from "./pending-reader-table.ts"

const SAMPLE: readonly PendingReader[] = [
  { file: "src/shared/a.ts", missingReader: "browser", reason: "r1", removeWhen: "w" },
  { file: "src/shared/b.ts", missingReader: "browser", reason: "r2", removeWhen: "w" },
  {
    file: "src/server/c.ts",
    missingReader: "production",
    exportName: "c",
    reason: "r3",
    removeWhen: "w",
  },
  {
    file: "src/server/d.ts",
    missingReader: "production",
    exportName: "d",
    reason: "r4",
    removeWhen: "w",
  },
]

describe("期限つきの例外の表", () => {
  it("行の file が実在する", () => {
    const missing = PENDING_READERS.map((row) => row.file).filter(
      (file) => !existsSync(`${REPOSITORY_ROOT}/${file}`),
    )

    expect(missing).toEqual([])
  })

  it("browser の行の file は src/shared/ の下", () => {
    const offenders = PENDING_READERS.filter(
      (row) => row.missingReader === "browser" && !row.file.startsWith("src/shared/"),
    )

    expect(offenders).toEqual([])
  })

  it("同じ file と export 名の行が2つ無い", () => {
    const keys = PENDING_READERS.map(
      (row) => `${row.file}#${row.missingReader === "production" ? row.exportName : ""}`,
    )

    expect(new Set(keys).size).toBe(keys.length)
  })

  it("production の行から `パス#名前` と理由の対応を作る", () => {
    expect(pendingProductionExports(SAMPLE)).toEqual({
      "src/server/c.ts#c": "r3",
      "src/server/d.ts#d": "r4",
    })
    expect(pendingProductionExports(SAMPLE.slice(0, 2))).toEqual({})
  })

  it("browser の行から src/ を外した相対パスの集合を作る", () => {
    expect([...pendingBrowserReaderFiles(SAMPLE)]).toEqual(["shared/a.ts", "shared/b.ts"])
    expect([...pendingBrowserReaderFiles(SAMPLE.slice(2))]).toEqual([])
  })
})

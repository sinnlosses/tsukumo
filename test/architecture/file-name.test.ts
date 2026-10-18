import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { listSourceFiles } from "./source-file.ts"

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/\/$/, "")

const TARGET_ROOTS = ["src", "scripts", "plugin"] as const

const LOCATION_WORDS: ReadonlySet<string> = new Set([
  "helpers",
  "helper",
  "utils",
  "util",
  "common",
])

describe("ファイル名", () => {
  it("置き場所を名前にした語（helper・util・common）で終わるファイルは無い", () => {
    const offenders = TARGET_ROOTS.flatMap((root) =>
      listSourceFiles(`${REPO_ROOT}/${root}`)
        .filter((relPath) => LOCATION_WORDS.has(lastWordOf(relPath)))
        .map(
          (relPath) =>
            `${root}/${relPath} は置き場所を名前にしたファイル名。ファイルは「何の概念か」で名付ける（${[...LOCATION_WORDS].join("・")} で終わる名前は作らない）`,
        ),
    )

    expect(offenders).toEqual([])
  })
})

function lastWordOf(relPath: string): string {
  const name = relPath.split("/").at(-1) ?? relPath
  return (
    name
      .replace(/\.tsx?$/, "")
      .split("-")
      .at(-1) ?? name
  )
}

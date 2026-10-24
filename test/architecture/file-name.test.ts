import { describe, expect, it } from "vitest"

import { REPOSITORY_ROOT } from "../../scripts/shared/repository-root.ts"
import { listSourceFiles } from "./source-file.ts"

const TARGET_ROOTS = ["src", "scripts", "plugin"] as const

const LOCATION_WORDS: ReadonlySet<string> = new Set([
  "helpers",
  "helper",
  "utils",
  "util",
  "common",
])

// 単数なのに `s` で終わる語のうち、語尾（-ss・-us・-is）で拾えないもの。
const SINGULAR_WORDS: ReadonlySet<string> = new Set(["settings", "beads"])

const SINGULAR_ENDINGS = ["ss", "us", "is"] as const

describe("ファイル名", () => {
  it("最後の語が複数形（s で終わる）のファイルは無い", () => {
    const offenders = [...TARGET_ROOTS, "test"].flatMap((root) =>
      listSourceFiles(`${REPOSITORY_ROOT}/${root}`)
        .filter((relPath) => isPluralName(lastStemWordOf(relPath)))
        .map(
          (relPath) =>
            `${root}/${relPath} は複数形に見えるファイル名。ファイルは単数形で名付ける（集まりは -list・-set などの単数の語に。単数で s に終わる語は SINGULAR_WORDS か語尾 ${SINGULAR_ENDINGS.join("・")} で外れる）`,
        ),
    )

    expect(offenders).toEqual([])
  })

  it("置き場所を名前にした語（helper・util・common）で終わるファイルは無い", () => {
    const offenders = TARGET_ROOTS.flatMap((root) =>
      listSourceFiles(`${REPOSITORY_ROOT}/${root}`)
        .filter((relPath) => LOCATION_WORDS.has(lastWordOf(relPath)))
        .map(
          (relPath) =>
            `${root}/${relPath} は置き場所を名前にしたファイル名。ファイルは「何の概念か」で名付ける（${[...LOCATION_WORDS].join("・")} で終わる名前は作らない）`,
        ),
    )

    expect(offenders).toEqual([])
  })
})

// `.test`・`.module` などの拡張子の連なりを落とし、`-` で割った最後の語を返す。
function lastStemWordOf(relPath: string): string {
  const name = relPath.split("/").at(-1) ?? relPath
  const stem = name.split(".")[0] ?? name
  return stem.split("-").at(-1) ?? stem
}

function isPluralName(word: string): boolean {
  return (
    word.endsWith("s") &&
    !SINGULAR_WORDS.has(word) &&
    !SINGULAR_ENDINGS.some((ending) => word.endsWith(ending))
  )
}

function lastWordOf(relPath: string): string {
  const name = relPath.split("/").at(-1) ?? relPath
  return (
    name
      .replace(/\.tsx?$/, "")
      .split("-")
      .at(-1) ?? name
  )
}

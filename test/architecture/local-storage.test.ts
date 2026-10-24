import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { withoutComments } from "../comment-line.ts"
import { listSourceFiles, SRC_ROOT } from "./source-file.ts"

// 保存の鍵の命名・壊れた値の畳み方・書けないときの握りつぶし方を1箇所に揃える。
describe("localStorage に触る箇所", () => {
  it("`localStorage` を読み書きするのは src/browser/utils/local-preference.ts だけ", () => {
    const allowed = "browser/utils/local-preference.ts"
    const offenders = listSourceFiles(SRC_ROOT)
      .filter((relPath) => relPath !== allowed)
      .filter((relPath) =>
        /\blocalStorage\b/.test(withoutComments(readFileSync(`${SRC_ROOT}/${relPath}`, "utf8"))),
      )

    expect(offenders).toEqual([])
  })
})

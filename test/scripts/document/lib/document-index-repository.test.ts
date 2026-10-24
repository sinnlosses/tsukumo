import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { readIndexStates } from "../../../../scripts/document/lib/document-index-repository.ts"
import { REPOSITORY_ROOT } from "../../../../scripts/shared/repository-root.ts"

// 設計判断の表・親の文書の子の一覧・子の文書の節の索引が、ADR と子の文書の題・見出しと食い違っていないことと、
// 節が2つ以下の子の文書に節の索引が無いことを守る。直すのは `pnpm run format`。

const STATES = readIndexStates(REPOSITORY_ROOT)

describe("文書の一覧表", () => {
  for (const { name, expected, actual } of STATES) {
    it(`${name} は題と見出しから組み立てた行と一致する（直すのは pnpm run format）`, () => {
      expect(actual).toEqual(expected)
    })
  }
})

describe("親の文書の子の一覧", () => {
  for (const { name, expected } of STATES.filter(({ kind }) => kind === "child-list")) {
    it(`${name} は、題と節の列の組で子を1つに決められる`, () => {
      const keys = expected.map(([, title = "", sections = ""]) => `${title}\t${sections}`)

      expect(expected.length).toBeGreaterThan(0)
      expect(new Set(keys).size).toBe(keys.length)
    })

    it(`${name} で節の列が兄弟と重なる子は、\`####\` の見出しを持たない（持てば列に載って分かれる）`, () => {
      const overlapping = expected.filter(
        ([, , sections]) => expected.filter((row) => row[2] === sections).length > 1,
      )
      const withSubsections = overlapping
        .map(([path = ""]) => path.replaceAll("`", ""))
        .filter((path) =>
          readFileSync(join(REPOSITORY_ROOT, path), "utf8")
            .split("\n")
            .some((line) => line.startsWith("#### ")),
        )

      expect(withSubsections).toEqual([])
    })
  }
})

import { describe, expect, it } from "vitest"

import { readIndexStates } from "../../../../scripts/document/lib/document-index-repository.ts"
import { REPOSITORY_ROOT } from "../../../../scripts/shared/repository-root.ts"

// 設計判断の表・親の文書の目次が、ADR と子の文書の題・責務の行と食い違っていないことと、
// 子の文書に節の索引が無いことを守る。直すのは `pnpm run format`。

const STATES = readIndexStates(REPOSITORY_ROOT)

describe("文書の一覧表", () => {
  for (const { name, expected, actual } of STATES) {
    it(`${name} は題と見出しから組み立てた行と一致する（直すのは pnpm run format）`, () => {
      expect(actual).toEqual(expected)
    })
  }
})

describe("設計判断の表", () => {
  it("すべての ADR が、題の次の空でない行に有効なステータスを持つ", () => {
    const decision = STATES.find(({ kind }) => kind === "decision")
    const withoutStatus = (decision?.expected ?? [])
      .filter(([, , status]) => status === "")
      .map(([path]) => path)

    expect(withoutStatus).toEqual([])
  })
})

describe("親の文書の子の一覧", () => {
  for (const { name, expected } of STATES.filter(({ kind }) => kind === "child-list")) {
    it(`${name} は、子が1つ以上あり、どの子にも説明がある`, () => {
      expect(expected.length).toBeGreaterThan(0)
      expect(expected.filter(([, description = ""]) => description === "")).toEqual([])
    })
  }
})

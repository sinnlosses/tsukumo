import { describe, expect, it } from "vitest"

import { readIndexStates } from "../../../scripts/document/lib/document-index-repository.ts"
import { REPOSITORY_ROOT } from "../../../scripts/shared/repository-root.ts"

// 設計判断の表と用語の索引が、ADR の題と用語集の見出しと食い違っていないことを守る。
// 直すのは `pnpm run format`。

describe("文書の一覧表", () => {
  for (const { name, expected, actual } of readIndexStates(REPOSITORY_ROOT)) {
    it(`${name} は見出しから組み立てた行と一致する（直すのは pnpm run format）`, () => {
      expect(actual).toEqual(expected)
    })
  }
})

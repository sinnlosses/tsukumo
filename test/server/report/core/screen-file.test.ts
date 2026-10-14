import { describe, expect, it } from "vitest"

import { hasScreenFile } from "../../../../src/server/report/core/screen-file.ts"

describe("hasScreenFile", () => {
  it("src/browser/ の下のファイル（module.css と styles/ を含む）があれば真", () => {
    expect(hasScreenFile(["src/browser/components/架空.tsx"])).toBe(true)
    expect(hasScreenFile(["src/browser/components/架空.module.css"])).toBe(true)
    expect(hasScreenFile(["docs/架空.md", "src/browser/styles/架空.css"])).toBe(true)
  })

  it("test/・docs/・src/server/・src/shared/ だけなら偽", () => {
    expect(
      hasScreenFile([
        "test/browser/架空.test.ts",
        "docs/architecture/架空.md",
        "src/server/架空.ts",
        "src/shared/架空.ts",
      ]),
    ).toBe(false)
    expect(hasScreenFile([])).toBe(false)
  })
})

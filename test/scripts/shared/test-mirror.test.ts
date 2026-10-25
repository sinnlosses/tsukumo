import { describe, expect, test } from "vitest"

import { mirrorTestPath } from "../../../scripts/shared/test-mirror.ts"

describe("mirrorTestPath", () => {
  test("src/ の対象は test/ の直下に鏡を置く", () => {
    expect(mirrorTestPath("src/shared/a.ts")).toBe("test/shared/a.test.ts")
  })

  test("tsx の拡張子を保つ", () => {
    expect(mirrorTestPath("src/browser/b.tsx")).toBe("test/browser/b.test.tsx")
  })

  test("scripts/ と plugin/ の対象は、同じ名前の枝の下に鏡を置く", () => {
    expect(mirrorTestPath("scripts/dev/c.ts")).toBe("test/scripts/dev/c.test.ts")
    expect(mirrorTestPath("plugin/d.ts")).toBe("test/plugin/d.test.ts")
  })
})

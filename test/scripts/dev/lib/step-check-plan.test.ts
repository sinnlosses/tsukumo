import { describe, expect, it } from "vitest"

import { planStepCheck } from "../../../../scripts/dev/lib/step-check-plan.ts"

describe("planStepCheck", () => {
  it("変えたコードのファイルがあれば、関連の単体を足す", () => {
    expect(planStepCheck(["src/a.ts", "README.md"])).toEqual([
      ["typecheck"],
      ["lint"],
      ["test", "--related", "src/a.ts"],
    ])
  })

  it("コードのファイルが無ければ、単体を打たない", () => {
    expect(planStepCheck(["README.md"])).toEqual([["typecheck"], ["lint"]])
  })
})

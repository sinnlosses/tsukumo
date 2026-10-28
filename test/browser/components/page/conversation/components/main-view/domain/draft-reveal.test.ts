import { describe, expect, it } from "vitest"

import { revealStepIdOf } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/draft-reveal.ts"
import { step, turnBodyText } from "../../../../../../../fixture/turn.ts"

const FINAL = step({
  id: 2,
  body: turnBodyText("架空の最終"),
  final: true,
  origin: { kind: "tool-report", toolUseId: "toolu_final" },
})

describe("revealStepIdOf", () => {
  it("草稿として描いていた report の確定版には掛けない", () => {
    expect(
      revealStepIdOf({
        newest: true,
        finalStep: FINAL,
        stepIdAtMount: undefined,
        draftedToolUseIds: new Set(["toolu_final"]),
      }),
    ).toBeUndefined()
  })

  it("草稿の無かった確定版には、出し始めたあとに現れたら掛ける", () => {
    expect(
      revealStepIdOf({
        newest: true,
        finalStep: FINAL,
        stepIdAtMount: undefined,
        draftedToolUseIds: new Set(["toolu_other"]),
      }),
    ).toBe(2)
  })

  it("今回のやり取りでなければ、草稿が無くても掛けない", () => {
    expect(
      revealStepIdOf({
        newest: false,
        finalStep: FINAL,
        stepIdAtMount: undefined,
        draftedToolUseIds: new Set(),
      }),
    ).toBeUndefined()
  })
})

import { describe, expect, it } from "vitest"

import { questionUsageEntriesOf } from "../../../../src/server/session-driver/core/question-usage.ts"
import type { Question } from "../../../../src/shared/session-driver/question.ts"

function question(options: readonly { readonly preview: string | undefined }[]): Question {
  return {
    header: "架空の見出し",
    text: "架空の質問文",
    multiSelect: false,
    options: options.map((option, index) => ({
      label: `架空の選択肢${index}`,
      description: "",
      preview: option.preview,
    })),
  }
}

describe("questionUsageEntriesOf", () => {
  it("質問ごとに、選択肢の数と preview の付いた数を1件にする", () => {
    const questions = [
      question([
        { preview: "架空のpreview" },
        { preview: undefined },
        { preview: "架空のpreview" },
      ]),
      question([{ preview: undefined }]),
    ]

    const entries = questionUsageEntriesOf(questions, "claude-session-1", 1_000)

    expect(entries).toEqual([
      { at: 1_000, sessionId: "claude-session-1", optionCount: 3, previewCount: 2 },
      { at: 1_000, sessionId: "claude-session-1", optionCount: 1, previewCount: 0 },
    ])
  })
})

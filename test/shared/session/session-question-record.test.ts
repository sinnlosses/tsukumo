import { describe, expect, it } from "vitest"

import type { QuestionBrief } from "../../../src/shared/session-driver/question-brief.ts"
import { mainViewEntries } from "../../../src/shared/session/main-view-entry.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import { requestEvent } from "../../fixture/session-event.ts"
import { apply } from "../../fixture/session-state.ts"

describe("applySessionEvent（質問の記録）", () => {
  const singleQuestion = {
    header: "確認",
    text: "どちらの案で進める？",
    multiSelect: false,
    options: [
      { label: "案A", description: "架空の説明A", preview: undefined },
      { label: "案B", description: "架空の説明B", preview: undefined },
    ],
  }

  const multiQuestion = {
    header: "確認",
    text: "どれを試す？",
    multiSelect: true,
    options: [
      { label: "案A", description: "架空の説明A", preview: undefined },
      { label: "案B", description: "架空の説明B", preview: undefined },
      { label: "案C", description: "架空の説明C", preview: undefined },
    ],
  }

  const NO_BRIEF = { briefs: [], imageSizes: [], unshelvedImages: [] } as const

  const brief: QuestionBrief = {
    header: "確認",
    whyAsk: "架空の理由。",
    facts: [{ text: "架空の事実。", basis: "checked" }],
    options: ["案A", "案B"].map((label) => ({
      label,
      irreversible: false,
      figures: [],
    })),
  }

  function questionEntries(...events: readonly SessionEvent[]) {
    return mainViewEntries(apply(...events)).filter((entry) => entry.kind === "question")
  }

  it("質問に答えると、そのやり取りの記録に質問1件が残る", () => {
    const entries = questionEntries(requestEvent(), {
      kind: "question-answered",
      toolUseId: "toolu_q",
      questions: [singleQuestion],
      answers: [["案B"]],
      ...NO_BRIEF,
    })

    expect(entries).toEqual([
      {
        kind: "question",
        toolUseId: "toolu_q",
        questions: [singleQuestion],
        answers: [["案B"]],
        ...NO_BRIEF,
      },
    ])
  })

  it("添え書きと画像の寸法は、答えた記録にそのまま残る", () => {
    const imageSizes = [{ path: "fictional/a.png", width: 320, height: 180 }]
    const entries = questionEntries(requestEvent(), {
      kind: "question-answered",
      toolUseId: "toolu_q",
      questions: [singleQuestion],
      answers: [["案A"]],
      briefs: [brief],
      imageSizes,
      unshelvedImages: ["fictional/b.png"],
    })

    expect(entries).toMatchObject([
      { briefs: [brief], imageSizes, unshelvedImages: ["fictional/b.png"] },
    ])
  })

  it("複数選択の答えは1つの文字列に畳まれず、選んだぶんだけ並ぶ", () => {
    const entries = questionEntries(requestEvent(), {
      kind: "question-answered",
      toolUseId: "toolu_q",
      questions: [multiQuestion],
      answers: [["案A", "案C"]],
      ...NO_BRIEF,
    })

    expect(entries).toEqual([
      {
        kind: "question",
        toolUseId: "toolu_q",
        questions: [multiQuestion],
        answers: [["案A", "案C"]],
        ...NO_BRIEF,
      },
    ])
  })

  it("答えていない質問（pending-changed だけ）は記録に残らない", () => {
    const entries = questionEntries(requestEvent(), {
      kind: "pending-changed",
      pending: [{ kind: "question", id: "toolu_q", questions: [singleQuestion], ...NO_BRIEF }],
    })

    expect(entries).toEqual([])
  })

  it("記録は前のやり取りに残り、次の依頼で消えない", () => {
    const view = apply(
      requestEvent("架空の依頼1"),
      {
        kind: "question-answered",
        toolUseId: "toolu_q",
        questions: [singleQuestion],
        answers: [["案A"]],
        ...NO_BRIEF,
      },
      requestEvent("架空の依頼2"),
    )

    expect(mainViewEntries(view).map((entry) => entry.kind)).toEqual([
      "request",
      "question",
      "request",
    ])
  })
})

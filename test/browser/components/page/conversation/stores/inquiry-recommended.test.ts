import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { useComposerDraft } from "../../../../../../src/browser/components/page/conversation/stores/composer-draft.ts"
import {
  useInquiryAnswer,
  type InquiryModel,
} from "../../../../../../src/browser/components/page/conversation/stores/inquiry-answer.ts"
import {
  useInquiryDraft,
  useInquiryFocus,
} from "../../../../../../src/browser/components/page/conversation/stores/inquiry-draft.ts"
import type { StampedPendingAsk } from "../../../../../../src/shared/session-driver/pending-ask.ts"
import type {
  Question,
  QuestionOption,
} from "../../../../../../src/shared/session-driver/question.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../session-store.ts"

/** 問いを開いたとき、おすすめの行を選んだ状態にする初期値を、部品を描かずに測る。 */

afterEach(() => {
  cleanup()
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
  useInquiryFocus.setState(useInquiryFocus.getInitialState(), true)
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

function option(label: string): QuestionOption {
  return { label, description: `架空の説明（${label}）`, preview: undefined }
}

function pendingWith(overrides: Partial<Question>): StampedPendingAsk {
  return {
    kind: "question",
    id: "ask-1",
    questions: [
      {
        header: "架空の選択",
        text: "架空の質問",
        multiSelect: false,
        options: [option("A案"), option("B案 (Recommended)")],
        ...overrides,
      },
    ],
    briefs: [],
    imageSizes: [],
    unshelvedImages: [],
    askedAt: 0,
  }
}

function render(
  pending: StampedPendingAsk,
  calls: unknown[] = [],
): { readonly current: InquiryModel } {
  putSession({ ...INITIAL_SESSION_STATE, pending: [pending] }, (command) => calls.push(command))
  return renderHook(() => useInquiryAnswer()).result
}

function asking(model: InquiryModel): Extract<InquiryModel, { kind: "question" }> {
  if (model.kind !== "question") {
    throw new Error("質問が出ている前提の検査")
  }
  return model
}

const selectedLabels = (model: InquiryModel): string[] =>
  asking(model)
    .options.filter((row) => row.selected)
    .map((row) => row.label)

describe("おすすめの初期値", () => {
  it("おすすめの行を選んだ状態で開き、「これで答える」1回で答えられる", () => {
    const calls: unknown[] = []
    const result = render(pendingWith({}), calls)

    expect(selectedLabels(result.current)).toEqual(["B案 (Recommended)"])
    expect(asking(result.current).canAnswer).toBe(true)
    act(() => asking(result.current).onAnswer())

    expect(calls).toEqual([
      {
        procedure: "session.answer",
        id: "ask-1",
        answer: { kind: "answers", answers: [{ kind: "chosen", labels: ["B案 (Recommended)"] }] },
      },
    ])
  })

  it("複数選択では、おすすめの行だけを選んだ状態にする", () => {
    const result = render(
      pendingWith({
        multiSelect: true,
        options: [option("A案 (Recommended)"), option("B案"), option("C案 (Recommended)")],
      }),
    )

    expect(selectedLabels(result.current)).toEqual(["A案 (Recommended)", "C案 (Recommended)"])
  })

  it("おすすめが無い問いは空で開く", () => {
    const result = render(pendingWith({ options: [option("A案"), option("B案")] }))

    expect(selectedLabels(result.current)).toEqual([])
    expect(asking(result.current).canAnswer).toBe(false)
  })

  it("書き始めると初期値の選択が外れ、字を消しても戻らない", () => {
    const result = render(pendingWith({}))

    act(() => useComposerDraft.getState().typeDraft({ text: "架空の答え", caret: 5 }))
    expect(selectedLabels(result.current)).toEqual([])

    act(() => useComposerDraft.getState().typeDraft({ text: "", caret: 0 }))
    expect(selectedLabels(result.current)).toEqual([])
  })

  it("複数選択で初期値の行を押すと外れる", () => {
    const result = render(pendingWith({ multiSelect: true }))

    act(() => asking(result.current).onToggle("B案 (Recommended)"))

    expect(selectedLabels(result.current)).toEqual([])
  })
})

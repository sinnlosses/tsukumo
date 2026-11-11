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
import type { Question } from "../../../../../../src/shared/session-driver/question.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../src/shared/session/session-state.ts"
import { putSession } from "../../../../session-store.ts"

/** 質問の「任せる」（その1問を任せた答えにして次へ進む）を、部品を描かずに測る。 */

afterEach(() => {
  cleanup()
  useInquiryDraft.setState(useInquiryDraft.getInitialState(), true)
  useInquiryFocus.setState(useInquiryFocus.getInitialState(), true)
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

function question(header: string, labels: readonly string[]): Question {
  return {
    header,
    text: `架空の質問（${header}）`,
    multiSelect: false,
    options: labels.map((label) => ({ label, description: "", preview: undefined })),
  }
}

function pendingOf(questions: readonly Question[]): StampedPendingAsk {
  return {
    kind: "question",
    id: "ask-1",
    questions,
    briefs: [],
    imageSizes: [],
    unshelvedImages: [],
    askedAt: 0,
  }
}

function renderRecording(pending: StampedPendingAsk): {
  readonly result: { readonly current: InquiryModel }
  readonly calls: unknown[]
} {
  const calls: unknown[] = []
  putSession({ ...INITIAL_SESSION_STATE, pending: [pending] }, (command) => calls.push(command))
  const { result } = renderHook(() => useInquiryAnswer())
  return { result, calls }
}

function asking(model: InquiryModel): Extract<InquiryModel, { kind: "question" }> {
  if (model.kind !== "question") {
    throw new Error("質問が出ている前提の検査")
  }
  return model
}

describe("useInquiryAnswer の任せる", () => {
  it("1問だけの質問は、任せると任せた答えを送る", () => {
    const { result, calls } = renderRecording(pendingOf([question("一", ["A案", "B案"])]))

    act(() => asking(result.current).onEntrust())

    expect(calls).toEqual([
      {
        procedure: "session.answer",
        id: "ask-1",
        answer: { kind: "answers", answers: [{ kind: "entrusted" }] },
      },
    ])
  })

  it("2問のとき、1問目を任せると送らず次の問へ進み、2問目を選ぶと任せた問と選んだ問を混ぜて送る", () => {
    const { result, calls } = renderRecording(
      pendingOf([question("1問目", ["A案", "B案"]), question("2問目", ["C案", "D案"])]),
    )

    act(() => asking(result.current).onEntrust())
    expect(calls).toEqual([])
    expect(asking(result.current).header).toBe("2問目")

    act(() => asking(result.current).onChoose("D案"))
    expect(calls).toEqual([
      {
        procedure: "session.answer",
        id: "ask-1",
        answer: {
          kind: "answers",
          answers: [{ kind: "entrusted" }, { kind: "chosen", labels: ["D案"] }],
        },
      },
    ])
  })

  it("入力欄の字は答えに使わず、下書きのまま残す", () => {
    useComposerDraft.getState().replaceDraft({ text: "架空の下書き", caret: 6 })
    const { result, calls } = renderRecording(pendingOf([question("一", ["A案", "B案"])]))

    act(() => asking(result.current).onEntrust())

    expect(calls).toEqual([
      {
        procedure: "session.answer",
        id: "ask-1",
        answer: { kind: "answers", answers: [{ kind: "entrusted" }] },
      },
    ])
    expect(useComposerDraft.getState().draft.text).toBe("架空の下書き")
  })
})

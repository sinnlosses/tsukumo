import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { TurnStatus } from "../../../../../../../../../src/browser/components/page/conversation/components/dispatch/components/turn-status/turn-status.tsx"
import { useComposerDraft } from "../../../../../../../../../src/browser/stores/composer-draft.ts"
import { useQuestionDraft } from "../../../../../../../../../src/browser/stores/question-answer.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../../../../../src/shared/session/session-state.ts"
import { typedElement } from "../../../../../../../../typed-element.ts"
import { type CommandSpy, putSession } from "../../../../../../../session-store.ts"

afterEach(() => {
  cleanup()
  // 組み立て中の答えはモジュール単位で残るので、次のテストへ持ち越さない。
  useQuestionDraft.setState(useQuestionDraft.getInitialState(), true)
  useComposerDraft.setState(useComposerDraft.getInitialState(), true)
})

function renderTurnStatus(
  stateOverrides: Partial<SessionState>,
  dispatch: CommandSpy = () => {},
): void {
  putSession({ ...INITIAL_SESSION_STATE, ...stateOverrides }, dispatch)
  render(<TurnStatus />)
}

describe("TurnStatus", () => {
  it("(4) ターンが進行中のときボタンが「中断」になり、押すと interrupt が dispatch される", () => {
    const calls: unknown[] = []
    renderTurnStatus({ turn: { kind: "running", startedAt: 0 } }, (command) => calls.push(command))

    const button = screen.getByRole("button")
    expect(button.textContent).toBe("中断")

    fireEvent.click(button)

    expect(calls).toEqual([{ procedure: "session.interrupt" }])
  })

  it("(5) 経過時間は running の起点から数え、ラベルは「経過」（進行中）", () => {
    const now = 1_700_000_010_000
    const clock = vi
      .spyOn(Temporal.Now, "instant")
      .mockReturnValue(Temporal.Instant.fromEpochMilliseconds(now))
    try {
      renderTurnStatus({ turn: { kind: "running", startedAt: now - 5_000 } })

      expect(screen.getByText("経過")).toBeDefined()
      expect(screen.getByText("5秒")).toBeDefined()
    } finally {
      clock.mockRestore()
    }
  })

  it("(5) finished になると経過時間が止まり、ラベルが「所要」に変わる", () => {
    renderTurnStatus({
      turn: { kind: "finished", startedAt: 0, finishedAt: 125_000, ending: { kind: "ended" } },
    })

    expect(screen.getByText("所要")).toBeDefined()
    expect(screen.getByText("2分05秒")).toBeDefined()
  })

  it("finished でも背景のタスクが残っていれば「所要」にならず「経過」のまま now まで数え続ける", () => {
    const now = 1_700_000_010_000
    const clock = vi
      .spyOn(Temporal.Now, "instant")
      .mockReturnValue(Temporal.Instant.fromEpochMilliseconds(now))
    try {
      renderTurnStatus({
        turn: {
          kind: "finished",
          startedAt: now - 5_000,
          finishedAt: now - 4_000,
          ending: { kind: "ended" },
        },
        backgroundTasks: [{ taskId: "task-1", kind: "agent", description: "架空の委譲" }],
      })

      expect(screen.getByText("経過")).toBeDefined()
      expect(screen.queryByText("所要")).toBeNull()
      expect(screen.getByText("5秒")).toBeDefined()
    } finally {
      clock.mockRestore()
    }
  })

  it("質問に答えている間は、ターンが進行中でもボタンが「答える」（type=submit）", () => {
    const calls: unknown[] = []
    renderTurnStatus(
      {
        turn: { kind: "running", startedAt: 0 },
        pending: [
          {
            kind: "question",
            id: "ask-question",
            questions: [
              {
                header: "架空の選択",
                text: "架空の質問",
                multiSelect: false,
                options: [{ label: "A案", description: "架空の説明A", preview: undefined }],
              },
            ],
          },
        ],
      },
      (command) => calls.push(command),
    )

    const button = typedElement(screen.getByRole("button"), HTMLButtonElement, "ボタン")
    expect(button.textContent).toBe("答える")
    expect(button.type).toBe("submit")

    fireEvent.click(button)

    expect(calls).toEqual([])
  })
  describe("API の知らせ（docs/architecture/display.md 4.2「入力欄」）", () => {
    it("失敗で終わったターンは「所要」ではなく「失敗」と理由の字を出す（色だけに頼らない）", () => {
      renderTurnStatus({
        turn: {
          kind: "finished",
          startedAt: 0,
          finishedAt: 12_000,
          ending: { kind: "failed", failure: { kind: "api-error", error: "overloaded" } },
        },
      })

      expect(screen.getByText("失敗")).toBeDefined()
      expect(screen.queryByText("所要")).toBeNull()
      expect(screen.getByRole("status").textContent).toBe("API が混んでいる（overloaded）")
    })

    it("進行中に呼び直しを待っているあいだは「再試行中 n/m」を出し、理由と待ち時間は title で読ませる", () => {
      renderTurnStatus({
        turn: { kind: "running", startedAt: 0 },
        apiTrouble: {
          kind: "retrying",
          at: 0,
          attempt: 2,
          maxRetries: 10,
          retryDelayMs: 4000,
          errorStatus: 529,
          error: "overloaded",
        },
      })

      const notice = screen.getByRole("status")
      expect(notice.textContent).toBe("再試行中 2/10")
      expect(notice.title).toBe("API が混んでいる（529）。4秒おいて呼び直す")
    })

    it("利用上限に達していれば、戻る時刻を添えて出す（失敗の理由より強い）", () => {
      const now = Temporal.ZonedDateTime.from("2026-09-24T12:00:00[UTC]")
      const clock = vi.spyOn(Temporal.Now, "instant").mockReturnValue(now.toInstant())
      const zone = vi.spyOn(Temporal.Now, "timeZoneId").mockReturnValue("UTC")
      try {
        renderTurnStatus({
          turn: {
            kind: "finished",
            startedAt: 0,
            finishedAt: 1000,
            ending: { kind: "failed", failure: { kind: "api-error", error: "rate_limit" } },
          },
          rateLimit: {
            kind: "rejected",
            bucket: "five-hour",
            resetsAt: now.add({ hours: 6 }).epochMilliseconds,
          },
        })

        const notice = screen.getByRole("status")
        expect(notice.textContent).toBe("利用上限 18:00まで")
        expect(notice.title).toBe("5時間枠の利用上限に達した。18:00に戻る")
        expect(screen.getByText("失敗")).toBeDefined()
      } finally {
        clock.mockRestore()
        zone.mockRestore()
      }
    })
  })
})

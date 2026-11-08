import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type {
  MainViewStep,
  MainViewStepBody,
} from "../../../../../../../src/shared/session/main-view-shape.ts"
import { INITIAL_SESSION_STATE } from "../../../../../../../src/shared/session/session-state.ts"
import { step, turn } from "../../../../../../fixture/turn.ts"
import { putSession } from "../../../../../session-store.ts"

// 「聞く」の口は、代役のボタンから `ask` を呼んで確かめる（指す位置の組み立ては `features/report` 側のテスト）。
vi.mock("../../../../../../../src/browser/features/report/report.tsx", async () => {
  const { use } = await import("react")
  const { ReplyPortContext } =
    await import("../../../../../../../src/browser/features/report/reply-port.ts")
  function AskStub(props: { readonly reportToolUseId?: string }) {
    const slot = use(ReplyPortContext)
    return slot.kind === "none" || props.reportToolUseId === undefined ? undefined : (
      <button
        type="button"
        onClick={() => {
          slot.port.ask(
            {
              label: { component: "架空の表", row: "架空の行" },
              key: { reportToolUseId: props.reportToolUseId ?? "", componentId: "t1", rowIndex: 2 },
            },
            "架空の問い",
          )
        }}
      >
        スタブの聞く
      </button>
    )
  }
  return {
    Report: (props: { readonly reportToolUseId?: string }) => (
      <AskStub reportToolUseId={props.reportToolUseId} />
    ),
  }
})

const { Turn } =
  await import("../../../../../../../src/browser/components/page/conversation/components/main-view/turn.tsx")

afterEach(() => {
  cleanup()
})

describe("Turn（レポートの「聞く」）", () => {
  it("口から問いを送ると、report の呼び出しの id を持つ指した所つきの送り方 ask の補足メッセージになる", () => {
    const calls: unknown[] = []
    putSession(INITIAL_SESSION_STATE, (command) => {
      calls.push(command)
    })
    const body: MainViewStepBody = {
      kind: "text",
      report: { kind: "markdown", markdown: "架空の本文" },
      firstLine: "架空の本文",
      task: { kind: "none" },
      finishedPhase: { kind: "none" },
      changeSummary: { kind: "none" },
    }
    const reportStep: MainViewStep = {
      ...step({ id: 0, body, mark: "final" }),
      origin: { kind: "tool-report", toolUseId: "toolu_fictional" },
    }

    render(<Turn turn={turn([reportStep])} newest freshReport={false} />)
    fireEvent.click(screen.getByRole("button", { name: "スタブの聞く" }))

    expect(calls).toEqual([
      {
        procedure: "session.prompt",
        text: "架空の問い",
        images: [],
        routing: "ask",
        target: {
          label: { component: "架空の表", row: "架空の行" },
          key: { reportToolUseId: "toolu_fictional", componentId: "t1", rowIndex: 2 },
        },
      },
    ])
  })
})

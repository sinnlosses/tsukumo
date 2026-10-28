import { describe, expect, it } from "vitest"

import { createReportDraftIntake } from "../../../../src/server/session-driver/core/draft-component-intake.ts"
import { a2uiReportComponentSchema } from "../../../../src/shared/report/a2ui-report-catalog.ts"
import type { SessionEvent } from "../../../../src/shared/session/session-event.ts"

const REPORT_NAME = "mcp__tsukumo__report"

const COMPONENTS = [
  { id: "root", component: "Report", children: ["s1"] },
  { id: "s1", component: "Section", heading: "架空の見出し", children: ["t1", "t2"] },
  { id: "t1", component: "Paragraph", text: '架空の本文 {括弧} "引用"' },
  { id: "t2", component: "Paragraph", text: "もう一つの架空の本文" },
]

const WHOLE = JSON.stringify({ title: "架空の題", components: COMPONENTS, tail: ["x"] })

function streamEvent(event: object, parent: string | null = null): object {
  return { type: "stream_event", parent_tool_use_id: parent, event }
}

function start(index: number, name = REPORT_NAME, id = "toolu_r1"): object {
  return { type: "content_block_start", index, content_block: { type: "tool_use", name, id } }
}

function delta(index: number, partial: string): object {
  return {
    type: "content_block_delta",
    index,
    delta: { type: "input_json_delta", partial_json: partial },
  }
}

function run(messages: readonly object[]): readonly SessionEvent[] {
  const intake = createReportDraftIntake()
  return messages.flatMap((message) => intake.observe(message))
}

function expected(components: readonly unknown[]): readonly SessionEvent[] {
  return components.map((component) => ({
    kind: "report-draft-component",
    toolUseId: "toolu_r1",
    component: a2uiReportComponentSchema.parse(component),
  }))
}

describe("ReportDraftIntake", () => {
  it("断片を 1 字ずつ与えても、全文の読みと同じ部品を同じ順で出す", () => {
    const events = run([
      streamEvent(start(1)),
      ...[...WHOLE].map((char) => streamEvent(delta(1, char))),
    ])

    expect(events).toEqual(expected(COMPONENTS))
  })

  it("部品が欠けると、全文の読みと食い違って検出できる", () => {
    const events = run([
      streamEvent(start(1)),
      ...Array.from(WHOLE.slice(0, WHOLE.indexOf('"id":"t2"')), (char) =>
        streamEvent(delta(1, char)),
      ),
    ])

    expect(events).not.toEqual(expected(COMPONENTS))
    expect(events).toEqual(expected(COMPONENTS.slice(0, 3)))
  })

  it("components を持たない引数・別のツール・サブエージェントのメッセージでは出ない", () => {
    const old = JSON.stringify({ sections: [{ heading: "架空", body: "架空" }] })
    expect(run([streamEvent(start(1)), streamEvent(delta(1, old))])).toEqual([])
    expect(
      run([streamEvent(start(1, "mcp__tsukumo__speak")), streamEvent(delta(1, WHOLE))]),
    ).toEqual([])
    expect(
      run([streamEvent(start(1), "toolu_sub"), streamEvent(delta(1, WHOLE), "toolu_sub")]),
    ).toEqual([])
  })

  it("形の合わない部品は黙って捨て、合う部品だけを出す", () => {
    const whole = JSON.stringify({
      components: [{ id: "bad", component: "Unknown" }, COMPONENTS[1]],
    })

    expect(run([streamEvent(start(1)), streamEvent(delta(1, whole))])).toEqual(
      expected([COMPONENTS[1]]),
    )
  })

  it("塊が閉じたあと・開いていない index の断片では出ない", () => {
    expect(
      run([
        streamEvent(start(1)),
        streamEvent({ type: "content_block_stop", index: 1 }),
        streamEvent(delta(1, WHOLE)),
      ]),
    ).toEqual([])
    expect(run([streamEvent(start(1)), streamEvent(delta(2, WHOLE))])).toEqual([])
  })

  it("message_start で登録を捨てる", () => {
    expect(
      run([
        streamEvent(start(1)),
        streamEvent({ type: "message_start" }),
        streamEvent(delta(1, WHOLE)),
      ]),
    ).toEqual([])
  })
})

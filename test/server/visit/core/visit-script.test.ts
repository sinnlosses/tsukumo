import { describe, expect, it } from "bun:test"

import {
  interruptsVisitScript,
  parseVisitScript,
  type VisitCast,
  visitCast,
  VISIT_SCRIPT_LIMITS,
  VISIT_SCRIPT_MODEL,
  visitScriptQuery,
  visitWaitedMs,
  visitWorkExcerpt,
} from "../../../../src/server/visit/core/visit-script.ts"
import { type SessionEvent } from "../../../../src/shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../src/shared/session-state.ts"
import { characterDefinition, portraits } from "../../../fixture/character.ts"

// 人格・依頼・セリフ・台本はすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。

const CAST: VisitCast = {
  host: {
    persona: "架空のあるじの人格",
    expressions: [
      { name: "default", label: "架空のふつう" },
      { name: "proud", label: "架空の得意げ" },
    ],
  },
  guest: {
    persona: "架空の客の人格",
    expressions: [
      { name: "default", label: "default" },
      { name: "bored", label: "架空のねむい" },
    ],
  },
}

function fold(events: readonly SessionEvent[]): SessionState {
  return events.reduce((state, event) => applySessionEvent(state, event, 0), INITIAL_SESSION_STATE)
}

const REQUEST: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }

describe("visitWorkExcerpt", () => {
  it("最後の依頼・直近のセリフ・走っているトップレベルのツールを抜き書きする", () => {
    const state = fold([
      { kind: "request", text: "架空の前の依頼", images: [] },
      { kind: "speech", text: "架空のセリフ1", expression: "proud" },
      REQUEST,
      { kind: "speech", text: "架空のセリフ2", expression: "proud" },
      { kind: "speech", text: "架空のセリフ3", expression: "proud" },
      { kind: "speech", text: "架空のセリフ4", expression: "proud" },
      {
        kind: "tool-started",
        toolUseId: "fictional-tool-1",
        name: "Bash",
        input: { command: "fictional-command", description: "架空の説明" },
        parentToolUseId: undefined,
      },
      {
        kind: "tool-started",
        toolUseId: "fictional-tool-2",
        name: "Read",
        input: { file_path: "fictional" },
        parentToolUseId: "fictional-tool-1",
      },
    ])

    expect(visitWorkExcerpt(state)).toEqual({
      request: "架空の依頼",
      speeches: ["架空のセリフ2", "架空のセリフ3", "架空のセリフ4"],
      waitingOn: ["Bash: 架空の説明 / fictional-command"],
    })
  })

  it("ツールが走っていなければ背景のタスクの説明を、依頼が無ければ空文字を返す", () => {
    const state = fold([
      {
        kind: "background-tasks-changed",
        tasks: [{ taskId: "fictional-bg-1", kind: "shell", description: "架空の背景の待ち" }],
      },
    ])

    expect(visitWorkExcerpt(state)).toEqual({
      request: "",
      speeches: [],
      waitingOn: ["架空の背景の待ち"],
    })
  })

  it("長い依頼とセリフは上限の長さで切る", () => {
    const long = "あ".repeat(VISIT_SCRIPT_LIMITS.requestChars + 10)
    const state = fold([
      { kind: "request", text: long, images: [] },
      { kind: "speech", text: long, expression: "proud" },
    ])

    const excerpt = visitWorkExcerpt(state)

    expect(excerpt.request).toBe(`${"あ".repeat(VISIT_SCRIPT_LIMITS.requestChars)}…`)
    expect(excerpt.speeches).toEqual([`${"あ".repeat(VISIT_SCRIPT_LIMITS.speechChars)}…`])
  })
})

describe("visitWaitedMs", () => {
  it("待ち始めてからの長さ。待っていなければ 0", () => {
    expect(visitWaitedMs({ kind: "waiting", since: 1_000 }, 91_000)).toBe(90_000)
    expect(visitWaitedMs({ kind: "idle" }, 91_000)).toBe(0)
  })
})

describe("interruptsVisitScript", () => {
  const waiting = fold([
    REQUEST,
    {
      kind: "tool-started",
      toolUseId: "fictional-tool-1",
      name: "Bash",
      input: {},
      parentToolUseId: undefined,
    },
  ])

  it("依頼・本物の speak・セッションの終わりで中断する", () => {
    expect(interruptsVisitScript(waiting, REQUEST)).toBe(true)
    expect(
      interruptsVisitScript(waiting, { kind: "speech", text: "架空", expression: "proud" }),
    ).toBe(true)
    expect(interruptsVisitScript(waiting, { kind: "session-ended", reason: "架空の理由" })).toBe(
      true,
    )
  })

  it("待ちが続いているあいだのほかのイベントでは中断しない。待ちが終わったら中断する", () => {
    const nested: SessionEvent = {
      kind: "tool-started",
      toolUseId: "fictional-tool-2",
      name: "Read",
      input: {},
      parentToolUseId: "fictional-tool-1",
    }
    expect(interruptsVisitScript(waiting, nested)).toBe(false)

    const finished: SessionEvent = {
      kind: "tool-finished",
      toolUseId: "fictional-tool-1",
      content: "",
      isError: false,
    }
    expect(interruptsVisitScript(applySessionEvent(waiting, finished, 0), finished)).toBe(true)
  })

  it("歯車の「訪問」をオフにすると、待ちが続いていても中断する。オンに戻すだけでは中断しない", () => {
    const toggledOff: SessionEvent = { kind: "visit-enabled-changed", visitEnabled: false }
    expect(interruptsVisitScript(waiting, toggledOff)).toBe(true)

    const toggledOn: SessionEvent = { kind: "visit-enabled-changed", visitEnabled: true }
    expect(interruptsVisitScript(waiting, toggledOn)).toBe(false)
  })
})

describe("visitCast", () => {
  it("あるじと客のパックから人格と表情を拾い、人格の無いパックは空文字にする", () => {
    const lookup = visitCast(
      [
        {
          name: "host",
          persona: "架空のあるじの人格",
          definition: characterDefinition({ portraits: portraits({ proud: "proud.png" }) }),
        },
        { name: "guest", persona: undefined, definition: undefined },
      ],
      "host",
      "guest",
    )

    expect(lookup).toEqual({
      kind: "found",
      cast: {
        host: {
          persona: "架空のあるじの人格",
          expressions: [
            { name: "default", label: "default" },
            { name: "proud", label: "proud" },
          ],
        },
        guest: { persona: "", expressions: [{ name: "default", label: "default" }] },
      },
    })
  })

  it("どちらかのパックが無ければ missing", () => {
    expect(visitCast([], "host", "guest")).toEqual({ kind: "missing" })
  })
})

describe("visitScriptQuery", () => {
  it("軽いモデルで、人格・表情・抜き書きを文面に載せ、表情は2人ぶんの enum で縛る", () => {
    const query = visitScriptQuery({
      cast: CAST,
      excerpt: { request: "架空の依頼", speeches: ["架空のセリフ"], waitingOn: ["架空の待ち"] },
      waitedMs: 3 * 60_000,
      localTime: "14:05",
      achievement: {
        kind: "known",
        date: "2026-01-01",
        today: "2026-01-01",
        commitCount: 4,
        doneTasks: { kind: "known", items: [{ id: "fictional-1", summary: "架空のタスク" }] },
        graduations: [],
        milestones: [],
        diary: { kind: "none" },
      },
    })

    expect(query.model).toBe(VISIT_SCRIPT_MODEL)
    for (const fragment of [
      "架空のあるじの人格",
      "架空の客の人格",
      "- proud: 架空の得意げ",
      "- bored: 架空のねむい",
      "架空の依頼",
      "架空のセリフ",
      "架空の待ち",
      "約 3 分",
      "14:05",
      "コミット 4 件",
      "架空のタスク",
    ]) {
      expect(query.prompt).toContain(fragment)
    }
    expect(query.schema).toMatchObject({
      properties: {
        lines: {
          items: { properties: { expression: { enum: ["default", "proud", "bored"] } } },
        },
      },
    })
  })
})

describe("parseVisitScript", () => {
  const VALID = {
    lines: [
      { speaker: "guest", expression: "bored", text: "架空の客の一言目" },
      { speaker: "host", expression: "proud", text: "  架空のあるじの返事  " },
      { speaker: "guest", expression: "default", text: "架空の客の二言目" },
    ],
  }

  it("形の整った台本を受け取り、セリフの前後の空白を落とす", () => {
    expect(parseVisitScript(VALID, CAST)).toEqual([
      { speaker: "guest", expression: "bored", text: "架空の客の一言目" },
      { speaker: "host", expression: "proud", text: "架空のあるじの返事" },
      { speaker: "guest", expression: "default", text: "架空の客の二言目" },
    ])
  })

  it("形の崩れは丸ごと undefined", () => {
    const line = VALID.lines[0]
    for (const value of [
      undefined,
      "架空の文字列",
      {},
      { lines: "架空" },
      { lines: VALID.lines.slice(0, VISIT_SCRIPT_LIMITS.minLines - 1) },
      { lines: Array.from({ length: VISIT_SCRIPT_LIMITS.maxLines + 1 }, () => line) },
      { lines: [...VALID.lines.slice(0, 2), "架空"] },
      { lines: [...VALID.lines.slice(0, 2), { ...line, text: "   " }] },
      { lines: [...VALID.lines.slice(0, 2), { ...line, text: 1 }] },
      {
        lines: [
          ...VALID.lines.slice(0, 2),
          { ...line, text: "あ".repeat(VISIT_SCRIPT_LIMITS.lineChars + 1) },
        ],
      },
    ]) {
      expect(parseVisitScript(value, CAST)).toBeUndefined()
    }
  })

  it("話し手の取り違え（知らない話し手・1行目があるじ・片方しか話さない）は undefined", () => {
    const [first, second, third] = VALID.lines
    for (const lines of [
      [first, { ...second, speaker: "user" }, third],
      [second, first, third],
      [first, { ...third }, { ...third }],
    ]) {
      expect(parseVisitScript({ lines }, CAST)).toBeUndefined()
    }
  })

  it("話し手のパックに無い表情（客の表情をあるじの行に使う・どちらにも無い）は undefined", () => {
    const [first, second, third] = VALID.lines
    expect(
      parseVisitScript({ lines: [first, { ...second, expression: "bored" }, third] }, CAST),
    ).toBeUndefined()
    expect(
      parseVisitScript({ lines: [{ ...first, expression: "excited" }, second, third] }, CAST),
    ).toBeUndefined()
  })
})

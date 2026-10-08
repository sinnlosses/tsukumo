import { describe, expect, it } from "vitest"

import {
  createPendingAnswerQueue,
  type AskRequest,
  type PendingAnswerHandlers,
} from "../../../../src/server/session-driver/core/pending-answer.ts"
import type { PendingAsk } from "../../../../src/shared/session-driver/pending-ask.ts"
import type { QuestionBrief } from "../../../../src/shared/session-driver/question-brief.ts"

/** 合図を見ないときの受け口。 */
function noHandlers(): PendingAnswerHandlers {
  return { onChange: () => {}, onAnswered: () => {} }
}

function permissionRequest(overrides: Partial<AskRequest> = {}): AskRequest {
  return {
    id: "toolu_1",
    toolName: "Bash",
    input: { command: "echo dummy" },
    signal: undefined,
    ...overrides,
  }
}

function questionRequest(overrides: Partial<AskRequest> = {}): AskRequest {
  return {
    id: "toolu_q",
    toolName: "AskUserQuestion",
    input: {
      questions: [
        {
          question: "どちらにする？",
          header: "選択",
          multiSelect: false,
          options: [
            { label: "こっち", description: "ダミーの説明", preview: undefined },
            { label: "あっち", description: "ダミーの説明", preview: undefined },
          ],
        },
      ],
    },
    signal: undefined,
    ...overrides,
  }
}

describe("createPendingAnswerQueue", () => {
  it("許可要求を積み、答えるまで解決しない", async () => {
    const changes: (readonly PendingAsk[])[] = []
    const queue = createPendingAnswerQueue({
      onChange: (pending) => changes.push(pending),
      onAnswered: () => {},
    })

    const asked = queue.ask(permissionRequest())
    await Promise.resolve()

    expect(queue.list()).toEqual([
      { kind: "permission", id: "toolu_1", toolName: "Bash", input: { command: "echo dummy" } },
    ])
    expect(changes).toHaveLength(1)

    queue.answer("toolu_1", { kind: "allow" })

    expect(await asked).toEqual({ behavior: "allow", updatedInput: { command: "echo dummy" } })
    expect(queue.list()).toEqual([])
    expect(changes).toHaveLength(2)
  })

  it("拒否すると理由付きで解決する（入力の中身は理由に含めない）", async () => {
    const queue = createPendingAnswerQueue(noHandlers())

    const asked = queue.ask(permissionRequest())
    queue.answer("toolu_1", { kind: "deny" })
    const result = await asked

    expect(result.behavior).toBe("deny")
    expect(result).not.toHaveProperty("updatedInput")
    expect(JSON.stringify(result)).not.toContain("echo dummy")
  })

  it("解決済みの id に再び答えても無視する", async () => {
    const queue = createPendingAnswerQueue(noHandlers())

    const asked = queue.ask(permissionRequest())
    expect(queue.answer("toolu_1", { kind: "allow" })).toBe(true)
    await asked

    expect(queue.answer("toolu_1", { kind: "deny" })).toBe(false)
    expect(queue.list()).toEqual([])
  })

  it("知らない id に答えても無視する", () => {
    const queue = createPendingAnswerQueue(noHandlers())

    expect(queue.answer("toolu_unknown", { kind: "allow" })).toBe(false)
  })

  it("答え待ちは積まれた順に並ぶ", () => {
    const queue = createPendingAnswerQueue(noHandlers())

    void queue.ask(permissionRequest({ id: "toolu_1" }))
    void queue.ask(permissionRequest({ id: "toolu_2", toolName: "Write" }))

    expect(queue.list().map((ask) => ask.id)).toEqual(["toolu_1", "toolu_2"])
  })

  it("AskUserQuestion は質問として積む", () => {
    const queue = createPendingAnswerQueue(noHandlers())

    void queue.ask(questionRequest())

    expect(queue.list()).toEqual([
      {
        kind: "question",
        id: "toolu_q",
        questions: [
          {
            header: "選択",
            text: "どちらにする？",
            multiSelect: false,
            options: [
              { label: "こっち", description: "ダミーの説明", preview: undefined },
              { label: "あっち", description: "ダミーの説明", preview: undefined },
            ],
          },
        ],
        briefs: [],
      },
    ])
  })

  it("質問の答えを updatedInput.answers の形に組む（questions はそのまま返す）", async () => {
    const queue = createPendingAnswerQueue(noHandlers())
    const request = questionRequest()

    const asked = queue.ask(request)
    queue.answer("toolu_q", { kind: "answers", labels: [["あっち"]] })

    expect(await asked).toEqual({
      behavior: "allow",
      updatedInput: { questions: request.input.questions, answers: { "どちらにする？": "あっち" } },
    })
  })

  it("複数選んだ答えは、SDK へ返すときだけ1つの文字列につなぐ", async () => {
    const queue = createPendingAnswerQueue(noHandlers())

    const asked = queue.ask(questionRequest())
    queue.answer("toolu_q", { kind: "answers", labels: [["こっち", "あっち"]] })

    expect(await asked).toMatchObject({
      updatedInput: { answers: { "どちらにする？": "こっち、あっち" } },
    })
  })

  it("何も選ばれていない質問は SDK へ返す answers に入れない", async () => {
    const queue = createPendingAnswerQueue(noHandlers())

    const asked = queue.ask(questionRequest())
    queue.answer("toolu_q", { kind: "answers", labels: [[]] })

    expect(await asked).toMatchObject({ updatedInput: { answers: {} } })
  })

  it("質問に答えると、記録のための合図を質問ごとの並びのまま1回だけ流す", () => {
    const answered: unknown[] = []
    const queue = createPendingAnswerQueue({
      onChange: () => {},
      onAnswered: (toolUseId, questions, answers) =>
        answered.push({ toolUseId, questions, answers }),
    })

    void queue.ask(questionRequest())
    queue.answer("toolu_q", { kind: "answers", labels: [["こっち", "自由入力の答え（架空）"]] })
    // 解決済みの id にもう一度答えても二度目は流れない。
    queue.answer("toolu_q", { kind: "answers", labels: [["あっち"]] })

    expect(answered).toEqual([
      {
        toolUseId: "toolu_q",
        questions: [
          {
            header: "選択",
            text: "どちらにする？",
            multiSelect: false,
            options: [
              { label: "こっち", description: "ダミーの説明", preview: undefined },
              { label: "あっち", description: "ダミーの説明", preview: undefined },
            ],
          },
        ],
        answers: [["こっち", "自由入力の答え（架空）"]],
      },
    ])
  })

  it("許可要求に答えても、記録のための合図は流れない", () => {
    const answered: unknown[] = []
    const queue = createPendingAnswerQueue({
      onChange: () => {},
      onAnswered: (toolUseId, questions, answers) =>
        answered.push({ toolUseId, questions, answers }),
    })

    void queue.ask(permissionRequest())
    queue.answer("toolu_1", { kind: "allow" })

    expect(answered).toEqual([])
  })

  it("答えの種類が答え待ちの種類に合わないときは無視して残す", () => {
    const queue = createPendingAnswerQueue(noHandlers())

    void queue.ask(questionRequest())
    expect(queue.answer("toolu_q", { kind: "allow" })).toBe(false)

    void queue.ask(permissionRequest())
    expect(queue.answer("toolu_1", { kind: "answers", labels: [["こっち"]] })).toBe(false)

    expect(queue.list().map((ask) => ask.id)).toEqual(["toolu_q", "toolu_1"])
  })

  it("questions の形が読めない AskUserQuestion は許可要求として扱う", () => {
    const queue = createPendingAnswerQueue(noHandlers())

    void queue.ask(questionRequest({ input: { questions: [] } }))

    expect(queue.list().map((ask) => ask.kind)).toEqual(["permission"])
  })

  it("ターンが中断されたら拒否として畳む（列の先頭を塞がない）", async () => {
    const queue = createPendingAnswerQueue(noHandlers())
    const controller = new AbortController()

    const asked = queue.ask(permissionRequest({ signal: controller.signal }))
    controller.abort()
    const result = await asked

    expect(result.behavior).toBe("deny")
    expect(queue.list()).toEqual([])
  })

  it("中断済みの signal で積むと、列に積まず拒否を返す", async () => {
    const changes: (readonly PendingAsk[])[] = []
    const queue = createPendingAnswerQueue({
      onChange: (pending) => changes.push(pending),
      onAnswered: () => {},
    })

    const result = await queue.ask(permissionRequest({ signal: AbortSignal.abort() }))

    expect(result.behavior).toBe("deny")
    expect(queue.list()).toEqual([])
    expect(changes).toEqual([])
  })

  it("settleAll は積まれた全件を拒否で解決し、空の状態を1回だけ知らせる", async () => {
    const changes: (readonly PendingAsk[])[] = []
    const queue = createPendingAnswerQueue({
      onChange: (pending) => changes.push(pending),
      onAnswered: () => {},
    })

    const first = queue.ask(permissionRequest())
    const second = queue.ask(questionRequest())
    changes.length = 0
    queue.settleAll()

    expect((await first).behavior).toBe("deny")
    expect((await second).behavior).toBe("deny")
    expect(queue.list()).toEqual([])
    expect(changes).toEqual([[]])
  })

  it("settleAll は何も積まれていなければ何も知らせない", () => {
    const changes: (readonly PendingAsk[])[] = []
    const queue = createPendingAnswerQueue({
      onChange: (pending) => changes.push(pending),
      onAnswered: () => {},
    })

    queue.settleAll()

    expect(changes).toEqual([])
  })

  it("答えたあとに abort が来ても二重に畳まない", async () => {
    const changes: (readonly PendingAsk[])[] = []
    const queue = createPendingAnswerQueue({
      onChange: (pending) => changes.push(pending),
      onAnswered: () => {},
    })
    const controller = new AbortController()

    const asked = queue.ask(permissionRequest({ signal: controller.signal }))
    queue.answer("toolu_1", { kind: "allow" })
    const result = await asked
    const countBefore = changes.length
    controller.abort()

    expect(result.behavior).toBe("allow")
    expect(changes.length).toBe(countBefore)
  })
})

describe("添え書きを次の質問に載せる", () => {
  const BRIEF: QuestionBrief = {
    header: "選択",
    background: "架空の背景。",
    axes: ["架空の軸"],
    options: ["こっち", "あっち"].map((label) => ({
      label,
      pros: ["架空の良い点。"],
      cons: [],
      byAxis: ["架空"],
      irreversible: label === "あっち",
      figures: [],
    })),
  }

  function briefsOf(pending: readonly PendingAsk[]): readonly (readonly QuestionBrief[])[] {
    return pending.flatMap((ask) => (ask.kind === "question" ? [ask.briefs] : []))
  }

  it("預けた添え書きは、次の AskUserQuestion の答え待ちに載って onChange に届く", () => {
    const changes: (readonly PendingAsk[])[] = []
    const queue = createPendingAnswerQueue({
      onChange: (pending) => changes.push(pending),
      onAnswered: () => {},
    })

    queue.holdBrief([BRIEF])
    void queue.ask(questionRequest())

    expect(changes.map(briefsOf)).toEqual([[[BRIEF]]])
  })

  it("質問と合わない添え書きは載せず、質問は添え書き無しで積む", () => {
    const queue = createPendingAnswerQueue(noHandlers())

    queue.holdBrief([{ ...BRIEF, header: "別の見出し" }])
    void queue.ask(questionRequest())

    expect(briefsOf(queue.list())).toEqual([[]])
  })

  it("使い切った添え書きは次の質問には載らない", () => {
    const queue = createPendingAnswerQueue(noHandlers())

    queue.holdBrief([BRIEF])
    void queue.ask(questionRequest({ id: "toolu_q1" }))
    void queue.ask(questionRequest({ id: "toolu_q2" }))

    expect(briefsOf(queue.list())).toEqual([[BRIEF], []])
  })

  it("dropBrief のあとの質問には載らない", () => {
    const queue = createPendingAnswerQueue(noHandlers())

    queue.holdBrief([BRIEF])
    queue.dropBrief()
    void queue.ask(questionRequest())

    expect(briefsOf(queue.list())).toEqual([[]])
  })

  it("許可要求では使い切らず、そのあとの質問に載る", () => {
    const queue = createPendingAnswerQueue(noHandlers())

    queue.holdBrief([BRIEF])
    void queue.ask(permissionRequest())
    void queue.ask(questionRequest())

    expect(briefsOf(queue.list())).toEqual([[BRIEF]])
  })
})

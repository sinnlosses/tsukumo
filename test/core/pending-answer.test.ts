import { describe, expect, it } from "bun:test"

import {
  createPendingAnswerQueue,
  type AskRequest,
  type PendingAnswerHandlers,
} from "../../src/core/pending-answer.ts"
import { type PendingAsk } from "../../src/protocol/pending-ask.ts"

/** 合図を見ないときの受け口。 */
function noHandlers(): PendingAnswerHandlers {
  return { onChange: () => {}, onAnswered: () => {} }
}

// フィクスチャはすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
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
            { label: "こっち", description: "ダミーの説明" },
            { label: "あっち", description: "ダミーの説明" },
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
              { label: "こっち", description: "ダミーの説明" },
              { label: "あっち", description: "ダミーの説明" },
            ],
          },
        ],
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
      onAnswered: (questions, answers) => answered.push({ questions, answers }),
    })

    void queue.ask(questionRequest())
    queue.answer("toolu_q", { kind: "answers", labels: [["こっち", "自由入力の答え（架空）"]] })
    // 解決済みの id にもう一度答えても二度目は流れない。
    queue.answer("toolu_q", { kind: "answers", labels: [["あっち"]] })

    expect(answered).toEqual([
      {
        questions: [
          {
            header: "選択",
            text: "どちらにする？",
            multiSelect: false,
            options: [
              { label: "こっち", description: "ダミーの説明" },
              { label: "あっち", description: "ダミーの説明" },
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
      onAnswered: (questions, answers) => answered.push({ questions, answers }),
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
})

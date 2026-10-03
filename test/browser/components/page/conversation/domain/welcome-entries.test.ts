import { describe, expect, it } from "vitest"

import {
  previousSessionOf,
  welcomeCardsOf,
  welcomeHeadOf,
} from "../../../../../../src/browser/components/page/conversation/domain/welcome-entries.ts"
import type { RecommendationCard } from "../../../../../../src/shared/recommendation/recommendation-card.ts"
import type {
  TaskSummaryItem,
  TaskSummaryResult,
} from "../../../../../../src/shared/repository/task-summary.ts"
import type { SessionChoice } from "../../../../../../src/shared/session/session-choice.ts"

function choice(sessionId: string, heading: string | undefined): SessionChoice {
  return { viewPort: 1, sessionId, lastModified: 0, startedAt: 0, heading }
}

function task(id: string, status: string, dependencies: readonly string[]): TaskSummaryItem {
  return {
    id,
    summary: `架空の${id}`,
    status,
    difficulty: "sonnet",
    loopable: "Y",
    dependencies,
    assignee: undefined,
    body: "",
    location: { kind: "none" },
  }
}

function known(items: readonly TaskSummaryItem[]): TaskSummaryResult {
  return { kind: "known", items, runPrompt: "/next-task {id}" }
}

function taskCard(taskId: string, reason: string): RecommendationCard {
  return { kind: "task", taskId, reason }
}

const NO_TASKS = known([])
const READY_TASKS = known([
  task("X-1", "todo", []),
  task("X-2", "todo", []),
  task("X-3", "todo", []),
  task("X-4", "todo", []),
])

describe("前回のセッション", () => {
  it("いまのセッションを除いた先頭を選ぶ", () => {
    const sessions = [choice("now", "今"), choice("prev", "前")]
    expect(previousSessionOf(sessions, "now")?.sessionId).toBe("prev")
  })

  it("いまのセッションしか無ければ無い", () => {
    expect(previousSessionOf([choice("now", "今")], "now")).toBeUndefined()
  })
})

describe("おすすめの札", () => {
  it("おすすめの並びと理由をそのまま当てる", () => {
    const cards = welcomeCardsOf(
      [taskCard("X-3", "理由3"), taskCard("X-1", "理由1")],
      undefined,
      undefined,
      READY_TASKS,
    )
    expect(cards.slice(0, 2).map((card) => [card.id, card.reason, card.request])).toEqual([
      ["X-3", "理由3", "X-3 に着手して"],
      ["X-1", "理由1", "X-1 に着手して"],
    ])
  })

  it("前回の続きの札は ID の席が見出しで、題と依頼の文は「残り：」から作る", () => {
    const cards = welcomeCardsOf(
      [{ kind: "resume", reason: "つながり" }],
      choice("prev", "架空の題"),
      "架空の作業。\n残り：架空の検証",
      NO_TASKS,
    )
    expect(cards).toEqual([
      {
        key: "resume",
        id: "架空の題",
        title: "架空の検証",
        reason: "つながり",
        request: "前回の続き: 架空の検証",
      },
    ])
  })

  it("見出しが無ければ前回の続きの ID は「（題なし）」", () => {
    const cards = welcomeCardsOf([], choice("prev", undefined), "残り：架空", NO_TASKS)
    expect(cards[0]?.id).toBe("（題なし）")
  })

  it("画面が「残り：」を持たないときは前回の続きの札を外し、空いた枠を既定の並びで埋める", () => {
    const recommendation: readonly RecommendationCard[] = [
      { kind: "resume", reason: "つながり" },
      taskCard("X-2", "理由2"),
    ]
    const cards = welcomeCardsOf(recommendation, choice("prev", "題"), "架空の作業。", READY_TASKS)
    expect(cards.map((card) => [card.id, card.reason])).toEqual([
      ["X-2", "理由2"],
      ["X-1", ""],
      ["X-3", ""],
    ])
  })

  it("いまの着手できる未着手に無いタスクの札は外す", () => {
    const cards = welcomeCardsOf(
      [taskCard("GONE-1", "理由"), taskCard("X-4", "理由4")],
      undefined,
      undefined,
      READY_TASKS,
    )
    expect(cards.map((card) => card.id)).toEqual(["X-4", "X-1", "X-2"])
  })

  it("おすすめが空のあいだは既定の並び（続き → 着手できる未着手の上から）で、理由は空", () => {
    const cards = welcomeCardsOf([], choice("prev", "題"), "残り：架空", READY_TASKS)
    expect(cards.map((card) => [card.id, card.reason])).toEqual([
      ["題", ""],
      ["X-1", ""],
      ["X-2", ""],
    ])
  })

  it("3枚までで、同じ札の重なりは先頭だけ残す", () => {
    const cards = welcomeCardsOf(
      [taskCard("X-1", "a"), taskCard("X-1", "b"), taskCard("X-2", "c"), taskCard("X-3", "d")],
      undefined,
      undefined,
      READY_TASKS,
    )
    expect(cards.map((card) => [card.id, card.reason])).toEqual([
      ["X-1", "a"],
      ["X-2", "c"],
      ["X-3", "d"],
    ])
  })

  it("依存で止まるもの・済んだものは既定の並びに入らない", () => {
    const cards = welcomeCardsOf(
      [],
      undefined,
      undefined,
      known([
        task("X-1", "done", []),
        task("X-2", "todo", ["X-3"]),
        task("X-3", "todo", []),
        task("X-4", "todo", ["X-1"]),
      ]),
    )
    expect(cards.map((card) => card.request)).toEqual(["X-3 に着手して", "X-4 に着手して"])
  })

  it("タスクが読めないときも空の帳面のときも、札は無い", () => {
    expect(welcomeCardsOf([], undefined, undefined, { kind: "unknown" })).toEqual([])
    expect(welcomeCardsOf([taskCard("X-1", "理由")], undefined, undefined, NO_TASKS)).toEqual([])
  })
})

describe("迎えの挨拶が名指す先頭の札", () => {
  it("先頭がタスクならその ID", () => {
    const cards = welcomeCardsOf([taskCard("X-2", "理由")], undefined, undefined, READY_TASKS)

    expect(welcomeHeadOf(cards)).toEqual({ kind: "card", name: "X-2" })
  })

  it("先頭が前回の続きなら見出しではなく「前回の続き」", () => {
    const cards = welcomeCardsOf(
      [{ kind: "resume", reason: "つながり" }],
      choice("prev", "架空の題"),
      "架空の作業。\n残り：架空の検証",
      READY_TASKS,
    )

    expect(welcomeHeadOf(cards)).toEqual({ kind: "card", name: "前回の続き" })
  })

  it("札が無ければ名指さない", () => {
    expect(welcomeHeadOf([])).toEqual({ kind: "none" })
  })
})

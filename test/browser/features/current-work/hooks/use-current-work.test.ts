import { renderHook } from "@testing-library/react"
import { createRef } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { useCurrentWork } from "../../../../../src/browser/features/current-work/hooks/use-current-work.ts"
import type { BackgroundTask } from "../../../../../src/shared/session-driver/background-task.ts"
import type { StampedPendingAsk } from "../../../../../src/shared/session-driver/pending-ask.ts"
import type { Question } from "../../../../../src/shared/session-driver/question.ts"
import {
  INITIAL_SESSION_STATE,
  type SessionState,
} from "../../../../../src/shared/session/session-state.ts"
import { characterInfo } from "../../../../fixture/character.ts"
import { requestRecord, toolRecord, workPlanRecord } from "../../../../fixture/session-record.ts"
import { putSession } from "../../../session-store.ts"

afterEach(() => {
  window.location.hash = ""
})

const RUNNING = { kind: "running", startedAt: 0 } satisfies SessionState["turn"]
const FINISHED = {
  kind: "finished",
  startedAt: 0,
  finishedAt: 1,
  ending: { kind: "ended" },
} satisfies SessionState["turn"]

const PERMISSION: StampedPendingAsk = {
  kind: "permission",
  id: "ask-1",
  toolName: "Read",
  input: {},
  askedAt: 0,
}

function questionPending(headers: readonly string[]): StampedPendingAsk {
  const questions = headers.map((header): Question => ({
    header,
    text: "架空の質問",
    multiSelect: false,
    options: [],
  }))
  return { kind: "question", id: "ask-1", questions, briefs: [], askedAt: 0 }
}

const SHELL_TASK = {
  taskId: "bash-1",
  kind: "shell",
  description: "架空の待ち",
} satisfies BackgroundTask
const AGENT_TASK = { taskId: "agent-1", kind: "agent", description: "" } satisfies BackgroundTask

const WRITING_DIARY = {
  kind: "writing",
  date: "2026-09-23",
  startedAt: 0,
  stage: "read",
} satisfies SessionState["diaryWriting"]
const NOT_DRAFTING = {
  kind: "open",
  bodies: { report: false, utterance: false },
  answeringAside: false,
  reportDrafting: { kind: "idle" },
} satisfies SessionState["sdkTurn"]
const DRAFTING = {
  ...NOT_DRAFTING,
  reportDrafting: { kind: "drafting", toolUseId: "fake-report-1" },
} satisfies SessionState["sdkTurn"]

const RUNNING_BASH = [
  requestRecord(),
  toolRecord({ toolUseId: "toolu_1", name: "Bash", input: { command: "echo dummy" } }),
]
const PHASES = ["架空の段A", "架空の段B", "架空の段C"]
const PLANNED_RECORDS = [
  requestRecord(),
  workPlanRecord({ phases: PHASES, current: 1 }),
  toolRecord({ toolUseId: "toolu_b", name: "Bash", input: { command: "echo b" } }),
]

function renderCurrentWork(state: Partial<SessionState>): ReturnType<typeof useCurrentWork> {
  putSession({ ...INITIAL_SESSION_STATE, ...state })
  return renderHook(() => useCurrentWork(createRef())).result.current
}

describe("useCurrentWork の札の語・印・要約（状態の強さの順）", () => {
  type Expected = {
    readonly word: string
    readonly mark?: "○" | "●"
    readonly summary?: string
  }
  const cases: readonly (readonly [string, Partial<SessionState>, Expected])[] = [
    ["依頼が一度も無い", {}, { word: "依頼待ち", mark: "○" }],
    [
      "雑談中の依頼待ちは名前入りで印が埋まる",
      { chatMode: true, character: characterInfo({ name: "架空の精霊" }) },
      { word: "架空の精霊 とおしゃべり中", mark: "●" },
    ],
    [
      "雑談中でも作業中は語を変えない",
      { chatMode: true, turn: RUNNING, records: [requestRecord()] },
      { word: "作業中" },
    ],
    [
      "ターンが終わってもバックグラウンドタスクが動いていれば背景で作業中で、要約は説明",
      { turn: FINISHED, records: [requestRecord()], backgroundTasks: [SHELL_TASK] },
      { word: "背景で作業中", mark: "●", summary: "架空の待ち" },
    ],
    [
      "バックグラウンドタスクが2件なら新しいほうに「ほか n件」を添え、説明が無ければ種類の語",
      { turn: FINISHED, backgroundTasks: [SHELL_TASK, AGENT_TASK] },
      { word: "背景で作業中", summary: "サブエージェント ほか1件" },
    ],
    [
      "ターンが走っている間はバックグラウンドタスクがあっても作業中",
      { turn: RUNNING, records: [requestRecord()], backgroundTasks: [SHELL_TASK] },
      { word: "作業中" },
    ],
    [
      "日記書き中は振り返り中で、要約は日付入り",
      { diaryWriting: WRITING_DIARY },
      { word: "振り返り中", mark: "●", summary: "9月23日の日記を書いています" },
    ],
    [
      "答え待ちは振り返り中より強い",
      { turn: RUNNING, pending: [PERMISSION], diaryWriting: WRITING_DIARY },
      { word: "答え待ち" },
    ],
    [
      "会話のターンが動いていれば作業中が振り返り中に勝つ",
      { turn: RUNNING, diaryWriting: WRITING_DIARY },
      { word: "作業中" },
    ],
    [
      "日記が written は振り返り中にならない",
      { diaryWriting: { kind: "written", date: "2026-09-23", writtenAt: 0 } },
      { word: "依頼待ち" },
    ],
    [
      "許可要求の答え待ちでレポートを書いている途中なら要約はレポートを書いています",
      { turn: RUNNING, pending: [PERMISSION], sdkTurn: DRAFTING },
      { word: "答え待ち", summary: "レポートを書いています" },
    ],
    [
      "質問の答え待ちは、レポートを書いている途中でも質問の要約が勝つ",
      { turn: RUNNING, pending: [questionPending(["最初の見出し"])], sdkTurn: DRAFTING },
      { word: "答え待ち", summary: "最初の見出し" },
    ],
    [
      "レポートが届けば実行中の手順の要約に戻る",
      { turn: RUNNING, records: RUNNING_BASH, sdkTurn: NOT_DRAFTING },
      { word: "作業中", summary: "Bash: echo dummy" },
    ],
    [
      "レポートを書いている途中は実行中の手順の要約を覆う",
      { turn: RUNNING, records: RUNNING_BASH, sdkTurn: DRAFTING },
      { word: "作業中", summary: "レポートを書いています" },
    ],
    [
      "許可要求の答え待ちは実行中の手順の要約に従う",
      { turn: RUNNING, pending: [PERMISSION], records: RUNNING_BASH },
      { word: "答え待ち", summary: "Bash: echo dummy" },
    ],
    [
      "質問の答え待ちは実行中のツールの要約より質問の要約を優先する",
      { turn: RUNNING, pending: [questionPending(["最初の見出し"])], records: RUNNING_BASH },
      { word: "答え待ち", summary: "最初の見出し" },
    ],
    [
      "質問が2問以上なら「ほか n問」を添える",
      { pending: [questionPending(["最初の見出し", "2問目", "3問目"])] },
      { word: "答え待ち", summary: "最初の見出し ほか2問" },
    ],
    [
      "セッションが終わると止まっている",
      { endedReason: "セッションが終了した", records: RUNNING_BASH },
      { word: "止まっている" },
    ],
  ]

  it.each(cases)("%s", (_name, state, expected) => {
    const work = renderCurrentWork(state)

    expect(work.wordLabel).toBe(expected.word)
    if (expected.mark !== undefined) {
      expect(work.mark).toBe(expected.mark)
    }
    expect(work.summary).toEqual(
      expected.summary === undefined ? { kind: "none" } : { kind: "text", label: expected.summary },
    )
  })
})

describe("useCurrentWork の札の今の段", () => {
  const cases: readonly (readonly [string, Partial<SessionState>, string | undefined])[] = [
    ["作業中は「位置/段の数 名前」", { turn: RUNNING, records: PLANNED_RECORDS }, "2/3 架空の段B"],
    [
      "レポートを書いている途中も段は残る",
      { turn: RUNNING, records: PLANNED_RECORDS, sdkTurn: DRAFTING },
      "2/3 架空の段B",
    ],
    [
      "段が1つでも「1/1 名前」",
      {
        turn: RUNNING,
        records: [requestRecord(), workPlanRecord({ phases: ["架空の段A"], current: 0 })],
      },
      "1/1 架空の段A",
    ],
    [
      "段が1つのワークプランを済ませると「1/1 済」",
      {
        turn: RUNNING,
        records: [requestRecord(), workPlanRecord({ phases: ["架空の段A"], current: 1 })],
      },
      "1/1 済",
    ],
    [
      "委譲先の段の範囲があれば群の名前が付く",
      {
        turn: RUNNING,
        records: [
          requestRecord(),
          workPlanRecord({
            phases: ["架空の計画", "架空の段A", "架空の段B", "架空の受け入れ"],
            current: 1,
            delegatedRange: { kind: "range", first: 1, count: 2 },
          }),
        ],
      },
      "本 1/2 架空の段A",
    ],
    [
      "ターンが終わると札から段は消える",
      {
        turn: FINISHED,
        records: [...PLANNED_RECORDS, workPlanRecord({ phases: PHASES, current: 3 })],
      },
      undefined,
    ],
  ]

  it.each(cases)("%s", (_name, state, label) => {
    expect(renderCurrentWork(state).phase).toEqual(
      label === undefined ? { kind: "none" } : { kind: "shown", label },
    )
  })
})

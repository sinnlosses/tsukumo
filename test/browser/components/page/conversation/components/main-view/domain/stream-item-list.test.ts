import { describe, expect, it } from "vitest"

import {
  foldSummaryOf,
  streamGroupsOf,
  streamItemsOf,
  type StreamItem,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/stream-item-list.ts"
import { conversationStreamRows } from "../../../../../../../../src/browser/domain/main-view/conversation-stream.ts"
import type {
  MainViewQuestion,
  MainViewToolRun,
} from "../../../../../../../../src/shared/session/main-view-shape.ts"
import type { SessionRecord } from "../../../../../../../../src/shared/session/session-record.ts"
import { splitIntoTurns } from "../../../../../../../../src/shared/session/turn.ts"
import {
  asideRecord,
  finishedToolStatus,
  reportRecord,
  requestRecord,
  speechRecord,
  workPlanRecord,
} from "../../../../../../../fixture/session-record.ts"
import { step, turn, turnBodyText } from "../../../../../../../fixture/turn.ts"

function rowsOf(records: readonly SessionRecord[]) {
  const [first] = splitIntoTurns(records)
  if (first === undefined) {
    throw new Error("やり取りが無い")
  }
  return conversationStreamRows(first)
}

function reportWith(toolUseId: string, conclusion: string): SessionRecord {
  const base = reportRecord(conclusion)
  if (base.kind !== "report") {
    throw new Error("report の記録ではない")
  }
  return { ...base, toolUseId }
}

const reportStep = (id: number, toolUseId: string, mark: "interim-kept" | "final") =>
  step({
    id,
    body: turnBodyText(`本文${String(id)}`),
    origin: { kind: "tool-report", toolUseId },
    mark,
  })

describe("streamItemsOf", () => {
  it("投稿とセリフと本文を、記録の位置の順に並べる（最終レポートが無いあいだは畳まない）", () => {
    const items = streamItemsOf(
      rowsOf([
        requestRecord(),
        speechRecord({ text: "一言目" }),
        asideRecord(),
        speechRecord({ text: "答え", answersAside: true }),
      ]),
      turn([]),
    )

    expect(items.map((item) => item.kind)).toEqual(["post", "say", "post", "say"])
  })

  it("最終レポートより前のセリフと補足の投稿は届いた順に畳みへ入り、依頼の投稿と最終レポートのあとのセリフは残る", () => {
    const items = streamItemsOf(
      rowsOf([
        requestRecord(),
        speechRecord({ text: "一言目" }),
        asideRecord(),
        speechRecord({ text: "答え", answersAside: true }),
        reportRecord("本文"),
        speechRecord({ text: "締め" }),
      ]),
      turn([reportStep(0, "fictional-report", "final")]),
    )

    expect(items.map((item) => item.kind)).toEqual(["post", "fold", "body", "say"])
    const fold = items[1]
    expect(fold?.kind === "fold" && fold.items.map((item) => item.kind)).toEqual([
      "say",
      "post",
      "say",
    ])
    expect(fold?.kind === "fold" && foldSummaryOf(fold.items)).toBe(
      "作業の経過 0 件 · セリフ 2 件 · 補足 1 件",
    )
  })

  it("最終レポートの前の段・質問・中間の本文は、最終レポートの上の作業の経過1つに畳む", () => {
    const items = streamItemsOf(
      rowsOf([
        requestRecord(),
        workPlanRecord(),
        speechRecord(),
        reportWith("interim", "中間"),
        reportWith("last", "最終"),
      ]),
      turn([reportStep(0, "interim", "interim-kept"), reportStep(1, "last", "final")]),
    )

    expect(items.map((item) => item.kind)).toEqual(["post", "fold", "body"])
    const fold = items[1]
    expect(fold?.kind === "fold" && fold.items.map((item) => item.kind)).toEqual([
      "plan",
      "say",
      "body",
    ])
    expect(fold?.kind === "fold" && foldSummaryOf(fold.items)).toBe("作業の経過 1 件 · セリフ 1 件")
  })

  it("締めのセリフは記録の順のまま紙の後ろに置き、中間レポートの締めは畳みの中、最終レポートの締めは紙の下に残る", () => {
    const items = streamItemsOf(
      rowsOf([
        requestRecord(),
        speechRecord({ text: "作業中" }),
        reportWith("interim", "中間"),
        speechRecord({ text: "中間の締め" }),
        reportWith("last", "最終"),
        speechRecord({ text: "最終の締め" }),
      ]),
      turn([reportStep(0, "interim", "interim-kept"), reportStep(1, "last", "final")]),
    )

    expect(items.map((item) => item.kind)).toEqual(["post", "fold", "body", "say"])
    expect(items[3]?.kind === "say" && items[3].record.text).toBe("最終の締め")
    const fold = items[1]
    expect(fold?.kind === "fold" && fold.items.map((item) => item.kind)).toEqual([
      "say",
      "body",
      "say",
    ])
  })

  it("最終レポートの後ろの質問の記録（お願い）は、締めのセリフと紙より後ろ、流れの最下部に来る", () => {
    const entry = {
      kind: "question",
      toolUseId: "ask-1",
      questions: [],
      answers: [],
      briefs: [],
      imageSizes: [],
      unshelvedImages: [],
    } as const
    const items = streamItemsOf(
      rowsOf([requestRecord(), reportRecord("本文"), speechRecord({ text: "締め" }), { ...entry }]),
      turn([
        step({
          ...reportStep(0, "fictional-report", "final"),
          actions: [{ ...entry, questions: [] }],
        }),
      ]),
    )

    expect(items.map((item) => item.kind)).toEqual(["post", "body", "say", "question"])
  })

  it("最終レポートが無いあいだは畳まず、突き合わせの外の本文は末尾に並ぶ", () => {
    const items = streamItemsOf(
      rowsOf([requestRecord(), workPlanRecord(), speechRecord()]),
      turn([step({ id: 0, body: turnBodyText("書きかけ"), mark: "plain" })]),
    )

    expect(items.map((item) => item.kind)).toEqual(["post", "say", "body"])
  })

  it("段のまとめは、その段を済ませた work_plan の記録の位置に出し、段を進めない呼び直しは取らない", () => {
    const phases = ["架空の段A", "架空の段B", "架空の段C", "架空の段D"]
    const phaseStep = (id: number) =>
      step({
        id,
        body: {
          kind: "text",
          report: { kind: "markdown", markdown: `まとめ${String(id)}` },
          firstLine: `まとめ${String(id)}`,
          task: { kind: "none" },
          finishedPhase: {
            kind: "phase",
            label: `段${String(id)}`,
            duration: { kind: "unknown" },
            skipped: false,
          },
          changeSummary: { kind: "none" },
        },
      })
    const items = streamItemsOf(
      rowsOf([
        requestRecord(),
        workPlanRecord({ phases, current: 0 }),
        speechRecord({ text: "段Aのセリフ" }),
        workPlanRecord({ phases, current: 1, phaseSummary: "まとめ1" }),
        speechRecord({ text: "段Bのセリフ" }),
        workPlanRecord({ phases, current: 1 }),
        speechRecord({ text: "段Bの続き" }),
        workPlanRecord({ phases, current: 2, phaseSummary: "まとめ2" }),
        speechRecord({ text: "段Cのセリフ" }),
      ]),
      turn([phaseStep(1), phaseStep(2)]),
    )

    expect(
      items.map((item) =>
        item.kind === "body"
          ? `body${String(item.step.id)}`
          : item.kind === "say"
            ? "say"
            : item.kind,
      ),
    ).toEqual(["post", "say", "body1", "say", "say", "body2", "say"])
  })

  it("失敗の表示は、turn-failure の記録の位置（やり取りの末尾）に置く", () => {
    const items = streamItemsOf(
      rowsOf([
        requestRecord(),
        speechRecord(),
        reportWith("fictional-report", "本文"),
        { kind: "turn-failure", failure: { kind: "max-turns" } },
      ]),
      turn([reportStep(0, "fictional-report", "final")]),
    )

    expect(items.map((item) => item.kind)).toEqual(["post", "fold", "body", "failure"])
    expect(items.at(-1)).toMatchObject({
      kind: "failure",
      ending: { kind: "failed", failure: { kind: "max-turns" } },
    })
  })

  it("中断の記録は、中断の表示として同じ位置に置く", () => {
    const items = streamItemsOf(rowsOf([requestRecord(), { kind: "turn-interrupted" }]), turn([]))

    expect(items.at(-1)).toMatchObject({ kind: "failure", ending: { kind: "interrupted" } })
  })

  it("残ったものは、済んだ段「n/N」・止めた段の名前・書き換えたファイルの数と1件の名前", () => {
    const written = (path: string, result: "succeeded" | "failed") =>
      ({
        kind: "tool",
        name: "Edit",
        input: { file_path: path },
        status: finishedToolStatus({
          result:
            result === "succeeded"
              ? { kind: "succeeded" }
              : { kind: "failed", output: { head: "x", omittedLength: 0 } },
        }),
      }) satisfies MainViewToolRun
    const items = streamItemsOf(
      rowsOf([
        requestRecord(),
        workPlanRecord({ phases: ["段A", ["段B", "段C"], "段D"], current: 1 }),
        { kind: "turn-failure", failure: { kind: "execution-error" } },
      ]),
      turn([
        step({
          id: 0,
          actions: [
            written("/work/a.ts", "succeeded"),
            written("/work/a.ts", "succeeded"),
            written("/work/b.ts", "succeeded"),
            written("/work/c.ts", "failed"),
          ],
        }),
      ]),
    )

    expect(items.at(-1)).toMatchObject({
      kind: "failure",
      remains: {
        phases: { done: 1, total: 3, stopped: "段B・段C" },
        files: { count: 2, first: "a.ts" },
      },
    })
  })

  it("ワークプランも書き換えも無ければ、残ったものは何も持たない", () => {
    const items = streamItemsOf(
      rowsOf([requestRecord(), { kind: "turn-failure", failure: { kind: "max-turns" } }]),
      turn([]),
    )

    const last = items.at(-1)
    expect(last?.kind === "failure" ? last.remains : undefined).toEqual({})
  })
})

describe("streamGroupsOf", () => {
  const [say1, say2] = streamItemsOf(
    rowsOf([speechRecord({ text: "一言目" }), speechRecord({ text: "二言目" })]),
    turn([]),
  )
  const [post] = streamItemsOf(rowsOf([requestRecord()]), turn([]))
  if (say1 === undefined || say2 === undefined || post === undefined) {
    throw new Error("見本の行が足りない")
  }
  const body = (id: number): StreamItem => ({
    kind: "body",
    step: step({ id, body: turnBodyText(`本文${String(id)}`) }),
  })
  const failure: StreamItem = { kind: "failure", ending: { kind: "interrupted" }, remains: {} }
  const shapeOf = (items: readonly StreamItem[]) =>
    streamGroupsOf(items).map((group) => group.items.map((item) => item.kind))

  it("セリフ → 札 → セリフは、札が後ろのセリフと組み、前のセリフは単独になる", () => {
    expect(shapeOf([say1, body(1), say2])).toEqual([["say"], ["body", "say"]])
  })

  it("札 → セリフは1組になる", () => {
    expect(shapeOf([body(1), say1])).toEqual([["body", "say"]])
  })

  it("後ろがセリフでない物は、前のセリフと組む", () => {
    expect(shapeOf([say1, failure])).toEqual([["say", "failure"]])
  })

  it("投稿は組に入らず、セリフは単独になる", () => {
    const groups = streamGroupsOf([post, say1])
    expect(groups.map((group) => group.speaker)).toEqual(["user", "other"])
    expect(shapeOf([post, say1])).toEqual([["post"], ["say"]])
  })

  it("セリフどうし・物どうしは組まない", () => {
    expect(shapeOf([say1, say2])).toEqual([["say"], ["say"]])
    expect(shapeOf([body(1), body(2)])).toEqual([["body"], ["body"]])
  })

  it("畳みの後ろの紙は、畳みと組まず後ろの締めのセリフと組む", () => {
    const fold: StreamItem = { kind: "fold", items: [] }
    expect(shapeOf([post, fold, body(1), say1])).toEqual([["post"], ["fold"], ["body", "say"]])
  })

  it("組の start は、組の頭の行が全体で何番目か", () => {
    expect(
      streamGroupsOf([say1, body(1), say2, failure, post]).map((group) => group.start),
    ).toEqual([0, 1, 3, 4])
  })

  it("平らにした組が、入力の並びと同じ", () => {
    const input = [say1, body(1), say2, failure, post, body(2)]
    expect(streamGroupsOf(input).flatMap((group) => group.items)).toEqual(input)
  })
})

describe("answer（答えた質問の投稿）", () => {
  const entry = (toolUseId: string): MainViewQuestion => ({
    kind: "question",
    toolUseId,
    questions: [
      {
        header: "確認",
        text: "どちらにする？",
        multiSelect: false,
        options: [{ label: "案A", description: "", preview: undefined }],
      },
    ],
    answers: [{ kind: "chosen", labels: ["案A"] }],
    briefs: [],
    imageSizes: [],
    unshelvedImages: [],
  })
  const questionRecord = (toolUseId: string): SessionRecord => entry(toolUseId)
  const turnWith = (...ids: readonly string[]) =>
    turn([step({ id: 0, actions: ids.map((id) => entry(id)) })])
  const kindsOf = (items: readonly StreamItem[]) => items.map((item) => item.kind)
  const shapeOf = (items: readonly StreamItem[]) =>
    streamGroupsOf(items).map((group) => ({
      kinds: group.items.map((item) => item.kind),
      speaker: group.speaker,
    }))

  it("say → question は1組で、answer は利用者の単独の組", () => {
    const items = streamItemsOf(rowsOf([speechRecord(), questionRecord("q1")]), turnWith("q1"))

    expect(kindsOf(items)).toEqual(["say", "question", "answer"])
    expect(shapeOf(items)).toEqual([
      { kinds: ["say", "question"], speaker: "other" },
      { kinds: ["answer"], speaker: "user" },
    ])
  })

  it("question のあとの say は、answer が間に入るので組まず単独になる", () => {
    const items = streamItemsOf(rowsOf([questionRecord("q1"), speechRecord()]), turnWith("q1"))

    expect(kindsOf(items)).toEqual(["question", "answer", "say"])
    expect(shapeOf(items)).toEqual([
      { kinds: ["question"], speaker: "other" },
      { kinds: ["answer"], speaker: "user" },
      { kinds: ["say"], speaker: "other" },
    ])
  })

  it("say → question → say は、question が前のセリフと組み、answer と後ろの say は単独", () => {
    const items = streamItemsOf(
      rowsOf([speechRecord(), questionRecord("q1"), speechRecord()]),
      turnWith("q1"),
    )

    expect(shapeOf(items).map((group) => group.kinds)).toEqual([
      ["say", "question"],
      ["answer"],
      ["say"],
    ])
  })

  it("最終レポートより前の question は畳みの中の1件のままで、answer を足さない", () => {
    const items = streamItemsOf(
      rowsOf([questionRecord("q1"), reportWith("last", "最終")]),
      turn([step({ id: 0, actions: [entry("q1")] }), reportStep(1, "last", "final")]),
    )

    expect(kindsOf(items)).toEqual(["fold", "body"])
  })

  it("最終レポートより後ろの question は answer と並んで最上位に残る", () => {
    const items = streamItemsOf(
      rowsOf([reportWith("last", "最終"), questionRecord("q1")]),
      turn([reportStep(0, "last", "final"), step({ id: 1, actions: [entry("q1")] })]),
    )

    expect(kindsOf(items)).toEqual(["body", "question", "answer"])
  })
})

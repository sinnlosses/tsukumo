import { describe, expect, it } from "vitest"

import { reportSectionsOfBody } from "../../../src/shared/report/report-block.ts"
import type { ReportCheck } from "../../../src/shared/report/report-check.ts"
import { SECTIONS_START_MARKDOWN as SECTIONS_START } from "../../../src/shared/report/report-markdown.ts"
import type { ReportTask } from "../../../src/shared/report/report-task.ts"
import {
  MAX_MAIN_VIEW_TURNS,
  type MainViewEntry,
  type MainViewStep,
  mainViewEntries,
  mainViewTurns,
} from "../../../src/shared/session/main-view.ts"
import type { SessionEvent } from "../../../src/shared/session/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type SessionState,
  type TurnBodies,
} from "../../../src/shared/session/session-state.ts"
import { reportEvent } from "../../fixture/report-event.ts"

/** いちばん新しいやり取りの本文がどれも確定している（ターンが終わっている）。 */
const SETTLED = { report: false, utterance: false } as const satisfies TurnBodies
/** いま走っている SDK ターンで `report` もツールの外の本文も届いている。 */
const WRITING = { report: true, utterance: true } as const satisfies TurnBodies

/** 本文を持つステップならその本文。持たなければ（ステップが無ければ）undefined。 */
const reportOf = (step: MainViewStep | undefined) =>
  step?.body.kind === "text" ? step.body.report : undefined
const firstLineOf = (step: MainViewStep | undefined) =>
  step?.body.kind === "text" ? step.body.firstLine : undefined
/** `task` の無い `report` の結論を包んだ形。 */
const lead = (conclusion: string) => `<div class="conclusion-lead">\n\n${conclusion}\n\n</div>`

const request = (text: string, turnId = 0): MainViewEntry => ({
  kind: "request",
  turnId,
  text,
  images: [],
})
const detail = (markdown: string): MainViewEntry => ({ kind: "detail", markdown })
const edit = (path: string): MainViewEntry => ({
  kind: "tool",
  name: "Edit",
  input: { file_path: path },
  status: {
    kind: "finished",
    finishedAt: { kind: "stamped", at: 0 },
    result: { kind: "succeeded" },
  },
})
/** `report` ツールで受け取ったレポート（引数を組んだあとの形）。中間レポートはここからしか生まれない。 */
const toolReport = (markdown: string): MainViewEntry => ({
  kind: "report",
  markdown,
  conclusion: "",
  task: { kind: "none" },
})
/** 見出しと箇条書きを持つ本文。資料らしい形でも `report` の外なら出ないことを確かめるのに使う。 */
const materialReport = (label: string): string => `## ${label}\n\n- 1つ目の発見\n- 2つ目の発見`

const question = (text: string): MainViewEntry => ({
  kind: "question",
  toolUseId: "toolu_fictional",
  questions: [{ header: "架空", text, multiSelect: false, options: [] }],
  answers: [],
})

describe("mainViewTurns（依頼で区切り、直近5件に絞る）", () => {
  it("依頼を境目にやり取りへ分ける", () => {
    const turns = mainViewTurns(
      [
        request("前の依頼"),
        detail("前のレポート"),
        request("今回の依頼"),
        detail("今回のレポート"),
      ],
      SETTLED,
      true,
    )

    expect(turns.map((turn) => turn.request?.text)).toEqual(["前の依頼", "今回の依頼"])
    expect(reportOf(turns[0]?.steps[0])).toBe("前のレポート")
    expect(reportOf(turns[1]?.steps[0])).toBe("今回のレポート")
  })

  it(`直近${String(MAX_MAIN_VIEW_TURNS)}件だけを昇順で残す（6件以上流しても絞られる）`, () => {
    const turnCount = MAX_MAIN_VIEW_TURNS + 3
    const entries = Array.from({ length: turnCount }, (_, index) => [
      request(`依頼${String(index)}`),
      detail(`レポート${String(index)}`),
    ]).flat()

    const turns = mainViewTurns(entries, SETTLED, true)

    expect(turns).toHaveLength(MAX_MAIN_VIEW_TURNS)
    expect(turns.map((turn) => turn.request?.text)).toEqual(
      Array.from({ length: MAX_MAIN_VIEW_TURNS }, (_, index) => {
        const originalIndex = turnCount - MAX_MAIN_VIEW_TURNS + index
        return `依頼${String(originalIndex)}`
      }),
    )
  })

  it("レポートとその後のツールの実行が1つのステップにまとまる", () => {
    const turns = mainViewTurns(
      [
        request("依頼"),
        detail("まず読むね"),
        edit("src/a.ts"),
        detail("次に直すね"),
        edit("src/b.ts"),
      ],
      SETTLED,
      true,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps).toHaveLength(2)
    expect(steps[0]?.actions).toHaveLength(1)
    expect(steps[1]?.actions).toHaveLength(1)
  })

  it("レポートより前に実行されたツールは、本文を持たない（body が none の）ステップになる", () => {
    const turns = mainViewTurns(
      [request("依頼"), edit("src/first.ts"), detail("あとから説明")],
      SETTLED,
      true,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps).toHaveLength(2)
    expect(steps[0]?.body).toEqual({ kind: "none" })
    expect(reportOf(steps[1])).toBe("あとから説明")
  })

  it("画面に出す記録が上限を超えたら、古いほうから落として件数を残す", () => {
    const entries = [
      request("依頼"),
      ...Array.from({ length: 45 }, (_, index) =>
        toolReport(materialReport(`レポート${String(index)}`)),
      ),
    ]

    const turns = mainViewTurns(entries, SETTLED, true)

    expect(turns[0]?.droppedCount).toBeGreaterThan(0)
    expect(reportOf(turns[0]?.steps.at(-1))).toBe(materialReport("レポート44"))
    expect(reportOf(turns[0]?.steps[0])).not.toBe(materialReport("レポート0"))
  })

  it("ツールの実行は上限に数えない（何十件呼んでも落ちない）", () => {
    const entries = [
      request("依頼"),
      toolReport("## 調べた結果\n\n- 1つめ\n- 2つめ\n"),
      ...Array.from({ length: 60 }, (_, index) => edit(`src/file${String(index)}.ts`)),
      toolReport(materialReport("直した")),
    ]

    const turns = mainViewTurns(entries, SETTLED, true)

    expect(turns[0]?.droppedCount).toBe(0)
    expect(reportOf(turns[0]?.steps[0])).toBe("## 調べた結果\n\n- 1つめ\n- 2つめ\n")
    expect(reportOf(turns[0]?.steps.at(-1))).toBe(materialReport("直した"))
  })

  it("上限を超えて古いステップが落ちても、残ったステップの id は変わらない", () => {
    const entries = [
      request("依頼"),
      ...Array.from({ length: 45 }, (_, index) =>
        toolReport(materialReport(`レポート${String(index)}`)),
      ),
    ]

    const before = mainViewTurns(entries, SETTLED, true)
    const idsBefore = (before[0]?.steps ?? []).map((step) => step.id)

    // さらに記録が積まれ、前の呼び出しでは残っていたステップも古いほうから落ちる。
    const after = mainViewTurns(
      [...entries, toolReport(materialReport("レポート45"))],
      SETTLED,
      true,
    )
    const idsAfter = (after[0]?.steps ?? []).map((step) => step.id)

    // 両方に残っているステップ（id の交わり）は、本文の中身も id も変わらない。
    const commonIds = idsAfter.filter((id) => idsBefore.includes(id))
    expect(commonIds.length).toBeGreaterThan(0)
    for (const id of commonIds) {
      const stepBefore = before[0]?.steps.find((step) => step.id === id)
      const stepAfter = after[0]?.steps.find((step) => step.id === id)
      expect(stepAfter?.body).toEqual(stepBefore?.body)
    }
    // id は作られた順の通し番号なので、添字（0始まりで詰め直したもの）とは違い連番のまま維持される。
    expect(idsAfter[0]).toBeGreaterThan(idsBefore[0] ?? -1)
  })

  it("report が呼ばれなかったターンは、最後の本文だけを最終レポートにする", () => {
    const turns = mainViewTurns(
      [
        request("依頼"),
        detail("まず読むね"),
        edit("src/a.ts"),
        detail(materialReport("調べた結果")),
        edit("src/b.ts"),
        detail("架空の答え。直しておいた。"),
      ],
      SETTLED,
      true,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => reportOf(step))).toEqual([
      undefined,
      undefined,
      "架空の答え。直しておいた。",
    ])
    expect(steps.map((step) => step.final)).toEqual([false, false, true])
    expect(steps.map((step) => step.interim)).toEqual([false, false, false])
    expect(turns[0]?.hasInterimReport).toBe(false)
  })

  it("最後の本文が英語でも実況でも、中身を問わずそれを最終レポートにする", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail("架空の日本語の答え。"), detail("A made-up English line.")],
      SETTLED,
      true,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => reportOf(step))).toEqual([undefined, "A made-up English line."])
    expect(steps.map((step) => step.final)).toEqual([false, true])
  })

  it("空白だけの本文は選ばず、その手前の本文を最終レポートにする", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail("架空の答え。"), detail("\u200B \n")],
      SETTLED,
      true,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => reportOf(step))).toEqual(["架空の答え。", undefined])
    expect(steps.map((step) => step.final)).toEqual([true, false])
  })

  it("短い返事だけのターン（ツールを1度も呼ばない）でも、締めの本文は残る", () => {
    const turns = mainViewTurns([request("依頼"), detail("文章だけで答える")], SETTLED, true)

    expect(reportOf(turns[0]?.steps[0])).toBe("文章だけで答える")
    expect(turns[0]?.steps[0]?.final).toBe(true)
  })

  it("質問の直前に書いた本文が最後なら、それが最終レポートになる", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail("比べた結果はこう"), question("どれにする？")],
      SETTLED,
      true,
    )

    const steps = turns[0]?.steps ?? []
    expect(reportOf(steps[0])).toBe("比べた結果はこう")
    expect(steps[0]?.actions).toHaveLength(1)
    expect(steps[0]?.interim).toBe(false)
  })

  it("最初の依頼より前の記録も、request 無しのターンとして残す", () => {
    const turns = mainViewTurns(
      [detail("依頼より前のレポート"), request("依頼"), detail("今回")],
      SETTLED,
      true,
    )

    expect(turns).toHaveLength(2)
    expect(turns[0]?.request).toBeUndefined()
    expect(reportOf(turns[0]?.steps[0])).toBe("依頼より前のレポート")
  })
})

describe("mainViewTurns（追い越された中間レポートを畳む印）", () => {
  it("後ろにレポートを持つステップがあれば superseded が立つ", () => {
    const first = "## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"
    const turns = mainViewTurns(
      [
        request("依頼"),
        toolReport(first),
        edit("src/a.ts"),
        toolReport(materialReport("片付いた")),
      ],
      SETTLED,
      true,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => step.interim)).toEqual([true, false])
    expect(steps.map((step) => step.superseded)).toEqual([true, false])
  })

  it("いちばん後ろの中間レポート（まだ追い越されていない）には superseded が立たない", () => {
    // 最後の report は動いているあいだ出ないので、手前の中間レポートを追い越すものがまだ無い。
    const turns = mainViewTurns(
      [
        request("依頼"),
        toolReport("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
        edit("src/a.ts"),
        toolReport("書きかけの結論"),
      ],
      WRITING,
      false,
    )

    expect(turns[0]?.steps[0]?.interim).toBe(true)
    expect(turns[0]?.steps[0]?.superseded).toBe(false)
  })

  it("<summary> に出す文字列は先頭行から作られる（見出しなら記号を落としてその語）", () => {
    const turns = mainViewTurns(
      [
        request("依頼"),
        toolReport("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
        edit("src/a.ts"),
        toolReport("できたよ"),
      ],
      SETTLED,
      true,
    )

    expect(firstLineOf(turns[0]?.steps[0])).toBe("調べた結果")
  })

  it("見出しでない先頭行は記号を落とさずそのまま使う", () => {
    const turns = mainViewTurns(
      [
        request("依頼"),
        toolReport("| 場所 | 状態 |\n| --- | --- |\n| src/a.ts | 直す |\n| src/b.ts | 直す |"),
        edit("src/a.ts"),
        toolReport("できたよ"),
      ],
      SETTLED,
      true,
    )

    expect(firstLineOf(turns[0]?.steps[0])).toBe("| 場所 | 状態 |")
  })

  it("先頭行が長いときは省略記号で切る", () => {
    const longHeading = `## ${"とても長い見出し".repeat(10)}`
    const turns = mainViewTurns(
      [
        request("依頼"),
        toolReport(`${longHeading}\n\n- 1つ目の発見\n- 2つ目の発見`),
        edit("src/a.ts"),
        toolReport("できたよ"),
      ],
      SETTLED,
      true,
    )

    const firstLine = firstLineOf(turns[0]?.steps[0]) ?? ""
    expect(firstLine.endsWith("…")).toBe(true)
    expect(firstLine.length).toBeLessThan(longHeading.length)
  })
})

describe("mainViewTurns（最終レポートの印）", () => {
  const interim = "## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"

  it("中間レポートには立たない（動いているあいだ、出ている本文がそれしか無くても）", () => {
    const turns = mainViewTurns(
      [request("依頼"), toolReport(interim), edit("src/a.ts"), toolReport("書きかけの結論")],
      WRITING,
      false,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => step.interim)).toEqual([true, false])
    expect(steps.map((step) => step.final)).toEqual([false, false])
  })

  // ターンは `turn-finished` で終わっていて本文は確定扱い（`unsettled.report` は false）だが、
  // 背景のタスクが残っている・続きのターンが動いているなど、やり取りそのものはまだ閉じていない
  // 場面（`closed: false`）。次の `report` が来ればこの本文は中間レポートへ回るかもしれないので、
  // 確定した本文であっても `final` を立てない（本文を出す判定と、札を立てる判定は別）。
  it("本文は確定していても、やり取りが閉じていなければ final を立てない", () => {
    const turns = mainViewTurns(
      [request("依頼"), toolReport(interim), edit("src/a.ts"), toolReport("いまの結論")],
      SETTLED,
      false,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => step.interim)).toEqual([true, false])
    expect(steps.map((step) => step.final)).toEqual([false, false])
    expect(turns[0]?.hasInterimReport).toBe(true)
  })

  it("同じ並びでも、やり取りが閉じていれば final が立つ", () => {
    const turns = mainViewTurns(
      [request("依頼"), toolReport(interim), edit("src/a.ts"), toolReport("いまの結論")],
      SETTLED,
      true,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => step.final)).toEqual([false, true])
  })

  it("前のやり取りは、いちばん新しいやり取りが閉じていなくても final が立ったまま", () => {
    const turns = mainViewTurns(
      [request("前の依頼"), detail("前のレポート"), request("今回の依頼"), detail("いまの本文")],
      SETTLED,
      false,
    )

    expect(turns[0]?.steps[0]?.final).toBe(true)
  })
})

describe("mainViewTurns（締めの speak → レポートで終える並び）", () => {
  // 締めの `speak` のあとに本文で終える並びを、SDK から届くイベントの形で流す。締めの `speak` は
  // `speech` になって本文の記録にならないので、そのあとの本文が最後の本文のまま残る。
  const speech = (text: string): SessionEvent => ({ kind: "speech", text, expression: "default" })
  const utterance = (text: string): SessionEvent => ({ kind: "utterance", text })
  const editRun = (toolUseId: string): readonly SessionEvent[] => [
    {
      kind: "tool-started",
      toolUseId,
      name: "Edit",
      input: { file_path: "src/a.ts" },
      parentToolUseId: undefined,
    },
    { kind: "tool-finished", toolUseId, content: "ok", isError: false },
  ]

  /** 架空のやり取りを1ターン流し終えたときのメインビュー（確定したやり取りとして描く）。 */
  function settledSteps(events: readonly SessionEvent[]): readonly MainViewStep[] {
    const state = [
      { kind: "request", text: "架空の依頼", images: [] } satisfies SessionEvent,
      ...events,
      { kind: "turn-finished", outcome: { kind: "completed" } } satisfies SessionEvent,
    ].reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
    return mainViewTurns(mainViewEntries(state), SETTLED, true)[0]?.steps ?? []
  }

  it("作業のあとに締めの speak を挟んで書いたレポートが最終レポートになる", () => {
    const steps = settledSteps([
      speech("見てくるぞ！"),
      utterance("まず `src/a.ts` を読むね"),
      ...editRun("toolu_1"),
      utterance("テストも通った"),
      speech("片付いたぞ！まとめを書いておくね"),
      utterance(materialReport("砂時計の目盛りを直した")),
    ])

    expect(steps.map((step) => reportOf(step))).toEqual([
      undefined,
      undefined,
      materialReport("砂時計の目盛りを直した"),
    ])
    expect(steps.map((step) => step.final)).toEqual([false, false, true])
    expect(steps.map((step) => step.interim)).toEqual([false, false, false])
  })

  it("手前の資料は出さず、締めの speak のあとのレポートだけが最終レポートになる", () => {
    const steps = settledSteps([
      utterance(materialReport("調べた結果")),
      ...editRun("toolu_1"),
      speech("ひとつ頼みたいことがあるんだ。まとめの最後に書いておく"),
      utterance(materialReport("直した結果")),
    ])

    expect(steps.map((step) => reportOf(step))).toEqual([undefined, materialReport("直した結果")])
    expect(steps.map((step) => step.interim)).toEqual([false, false])
    expect(steps.map((step) => step.final)).toEqual([false, true])
  })

  it("レポートの無いターンでも、締めの speak のあとの短い答えが最終レポートになる", () => {
    const steps = settledSteps([
      ...editRun("toolu_1"),
      speech("直しておいたぞ！ひとことだけ書いておくね"),
      utterance("`src/a.ts` の1行を直した。"),
    ])

    expect(reportOf(steps.at(-1))).toBe("`src/a.ts` の1行を直した。")
    expect(steps.at(-1)?.final).toBe(true)
  })
})

describe("mainViewTurns（report の無いターンが進行中のあいだは、本文を出さない）", () => {
  const material = "## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"

  it("進行中は、いちばん新しいターンの本文を1つも出さない（ツールが付いた資料も）", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail(material), edit("src/a.ts"), detail("まず `src/a.ts` を読むね")],
      WRITING,
      false,
    )

    expect((turns[0]?.steps ?? []).map((step) => reportOf(step))).toEqual([undefined, undefined])
  })

  it("書きかけのあいだは final が立たない（書き上げる演出が途中の本文を相手にしない）", () => {
    const streaming = mainViewTurns([request("依頼"), detail(material)], WRITING, false)
    const settled = mainViewTurns([request("依頼"), detail(material)], SETTLED, true)

    expect(streaming[0]?.steps.map((step) => step.final)).toEqual([false])
    expect(settled[0]?.steps.map((step) => step.final)).toEqual([true])
  })

  it("進行中に隠すのはいちばん新しいターンだけで、前のターンの最終レポートは残る", () => {
    const turns = mainViewTurns(
      [request("前の依頼"), detail("直したよ"), request("今回の依頼"), detail("まず読むね")],
      WRITING,
      false,
    )

    expect(reportOf(turns[0]?.steps[0])).toBe("直したよ")
    expect(reportOf(turns[1]?.steps[0])).toBeUndefined()
  })
})

describe("mainViewTurns（report ツールで受け取ったレポート）", () => {
  const fold = (events: readonly SessionEvent[]) =>
    events.reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
  const turnOf = (events: readonly SessionEvent[], unsettled: TurnBodies, closed: boolean) =>
    mainViewTurns(mainViewEntries(fold(events)), unsettled, closed).at(-1)
  const ask: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const text = (markdown: string): SessionEvent => ({ kind: "utterance", text: markdown })
  const report = (
    conclusion: string,
    body = "",
    favor = "",
    checks: readonly ReportCheck[] = [],
    task: ReportTask = { kind: "none" },
  ): SessionEvent =>
    reportEvent({
      toolUseId: "toolu_r1",
      conclusion,
      sections: reportSectionsOfBody(body),
      favor,
      checks,
      task,
    })
  const toolRun = (id: string): readonly SessionEvent[] => [
    {
      kind: "tool-started",
      toolUseId: id,
      name: "Edit",
      input: { file_path: "/tmp/dummy/a.ts" },
      parentToolUseId: undefined,
    },
    { kind: "tool-finished", toolUseId: id, content: "ok", isError: false },
  ]
  const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }
  const shownReports = (turn: ReturnType<typeof turnOf>) =>
    (turn?.steps ?? []).flatMap((step) => {
      const shown = reportOf(step)
      return shown === undefined ? [] : [shown]
    })

  it("conclusion → body → favor（お願いの塊）の順に1つの本文へ組み、最終レポートにする", () => {
    const turn = turnOf(
      [ask, report("架空の結論。", "| 列 |\n| --- |\n| 値 |", "架空のお願い"), finished],
      SETTLED,
      true,
    )

    expect(shownReports(turn)).toEqual([
      `${lead("架空の結論。")}\n\n` +
        `${SECTIONS_START}\n\n| 列 |\n| --- |\n| 値 |\n\n<div class="note note-favor" id="favor-toolu_r1">\n\n架空のお願い\n\n</div>`,
    ])
    expect(turn?.steps.map((step) => step.final)).toEqual([true])
    expect(firstLineOf(turn?.steps[0])).toBe("架空の結論。")
  })

  it("body は整形してから組む（落とせる行は描かず、残りと favor はそのまま）", () => {
    const turn = turnOf(
      [
        ask,
        report(
          "架空の結論。",
          "架空の結論。\n\n架空の根拠。\n\n## 架空の空の節\n\n以上です。",
          "架空のお願い",
        ),
        finished,
      ],
      SETTLED,
      true,
    )

    const [shown] = shownReports(turn)
    expect(shown?.startsWith(lead("架空の結論。"))).toBe(true)
    expect(
      shown?.endsWith(
        `${SECTIONS_START}\n\n架空の根拠。\n\n<div class="note note-favor" id="favor-toolu_r1">\n\n架空のお願い\n\n</div>`,
      ),
    ).toBe(true)
  })

  it("report が呼ばれなかったターンの本文には整形を掛けない", () => {
    const turn = turnOf([ask, text("架空の答え。\n\n以上です。"), finished], SETTLED, true)

    expect(shownReports(turn)).toEqual(["架空の答え。\n\n以上です。"])
  })

  it("checks は結論のすぐ下の合図の行に組み、口は出ない。お願いの本文は末尾のまま（body より前）", () => {
    const checks: readonly ReportCheck[] = [
      { status: "ok", label: "架空の検査", figure: "12 / 3", command: "", detail: "架空の件数" },
      { status: "unverified", label: "架空の目視", figure: "", command: "", detail: "" },
    ]
    const turn = turnOf(
      [ask, report("架空の結論。", "架空の根拠。", "架空のお願い", checks), finished],
      SETTLED,
      true,
    )

    const [shown = "", ...rest] = shownReports(turn)

    expect(rest).toEqual([])
    expect(
      shown.startsWith(
        `${lead("架空の結論。")}\n\n<div class="status">\n\n` +
          '<div class="verdict" role="group" aria-label="検証結果"><div class="checks">',
      ),
    ).toBe(true)
    expect(
      shown.endsWith(
        `</div>\n\n</div>\n\n${SECTIONS_START}\n\n` +
          '架空の根拠。\n\n<div class="note note-favor" id="favor-toolu_r1">\n\n架空のお願い\n\n</div>',
      ),
    ).toBe(true)
    expect(shown.split('<div class="status">')).toHaveLength(2)
    expect(firstLineOf(turn?.steps[0])).toBe("架空の結論。")
  })

  it("command と完全一致した同じやり取りの最後の Bash の所要時間を、行に添える", () => {
    const bashStarted = (id: string, command: string): SessionEvent => ({
      kind: "tool-started",
      toolUseId: id,
      name: "Bash",
      input: { command },
      parentToolUseId: undefined,
    })
    const bashFinished = (id: string): SessionEvent => ({
      kind: "tool-finished",
      toolUseId: id,
      content: "ok",
      isError: false,
    })
    const timed: readonly (readonly [SessionEvent, number])[] = [
      [ask, 0],
      [bashStarted("toolu_b1", "架空の検査"), 1_000],
      [bashFinished("toolu_b1"), 5_000],
      [bashStarted("toolu_b2", "架空の検査"), 6_000],
      [bashFinished("toolu_b2"), 68_000],
      [bashStarted("toolu_b3", "架空の検査 --別"), 69_000],
      [bashFinished("toolu_b3"), 70_000],
      [
        report("架空の結論。", "", "", [
          { status: "ok", label: "一致する", figure: "", command: "架空の検査", detail: "" },
          { status: "ok", label: "一致しない", figure: "", command: "架空の検", detail: "" },
        ]),
        71_000,
      ],
      [finished, 72_000],
    ]
    const state = timed.reduce(
      (current, [event, at]) => applySessionEvent(current, event, at),
      INITIAL_SESSION_STATE,
    )
    const [shown] = shownReports(mainViewTurns(mainViewEntries(state), SETTLED, true).at(-1))

    expect(shown).toContain(
      '<span class="check-mark">✓</span><span class="check-label">一致する</span><span class="check-figure"></span><span class="check-time">1分02秒</span>',
    )
    expect(shown).toContain(
      '<span class="check-mark">✓</span><span class="check-label">一致しない</span><span class="check-figure"></span><span class="check-time"></span>',
    )
  })

  it("run_in_background の Bash は完了の知らせまでの時間を添え、知らせが届かなければ空にする", () => {
    const backgroundStarted = (id: string, command: string): SessionEvent => ({
      kind: "tool-started",
      toolUseId: id,
      name: "Bash",
      input: { command, run_in_background: true },
      parentToolUseId: undefined,
    })
    const accepted = (id: string): SessionEvent => ({
      kind: "tool-finished",
      toolUseId: id,
      content: "架空の受付",
      isError: false,
    })
    const timed: readonly (readonly [SessionEvent, number])[] = [
      [ask, 0],
      [backgroundStarted("toolu_b1", "架空の検査"), 1_000],
      [accepted("toolu_b1"), 1_300],
      [backgroundStarted("toolu_b2", "架空の別の検査"), 2_000],
      [accepted("toolu_b2"), 2_300],
      [{ kind: "background-tool-finished", toolUseId: "toolu_b1" }, 63_000],
      [
        report("架空の結論。", "", "", [
          { status: "ok", label: "知らせが届いた", figure: "", command: "架空の検査", detail: "" },
          {
            status: "ok",
            label: "知らせが届かない",
            figure: "",
            command: "架空の別の検査",
            detail: "",
          },
        ]),
        64_000,
      ],
      [finished, 65_000],
    ]
    const state = timed.reduce(
      (current, [event, at]) => applySessionEvent(current, event, at),
      INITIAL_SESSION_STATE,
    )
    const [shown] = shownReports(mainViewTurns(mainViewEntries(state), SETTLED, true).at(-1))

    expect(shown).toContain(
      '<span class="check-mark">✓</span><span class="check-label">知らせが届いた</span><span class="check-figure"></span><span class="check-time">1分02秒</span>',
    )
    expect(shown).toContain(
      '<span class="check-mark">✓</span><span class="check-label">知らせが届かない</span><span class="check-figure"></span><span class="check-time"></span>',
    )
  })

  it("段取りを渡したやり取りでは、中間レポートはまとめだけで、最終レポートは結論の下に段ごとの所要時間の表を置く", () => {
    const plan = (current: number, phaseSummary: string): SessionEvent => ({
      kind: "work-plan",
      phases: ["架空の段A", "架空の段B"],
      current,
      phaseSummary,
    })
    const turn = turnOf(
      [
        ask,
        plan(0, ""),
        plan(1, "架空のまとめ。"),
        report("架空の結論。", "架空の根拠。"),
        finished,
      ],
      SETTLED,
      true,
    )

    const [summary, final] = shownReports(turn)

    expect(summary).toBe("架空のまとめ。")
    expect(
      final?.startsWith(
        `${lead("架空の結論。")}\n\n<div class="status">\n\n<div class="phase-times">`,
      ),
    ).toBe(true)
    expect(final).toContain('<span class="phase-time-label">2/2 架空の段B</span>')
    expect(final?.endsWith(`</div>\n\n${SECTIONS_START}\n\n架空の根拠。`)).toBe(true)
  })

  it("同じ依頼に段取りがあるレポートは progress の塊を描かず、段取りが無いレポートは描く", () => {
    const withProgress: SessionEvent = reportEvent({
      toolUseId: "toolu_r1",
      sections: [
        {
          heading: "架空の節",
          blocks: [
            { kind: "progress", steps: ["架空の道A", "架空の道B"], current: 0, fold: "" },
            { kind: "text", text: "架空の根拠。", fold: "" },
          ],
        },
      ],
    })
    const plan: SessionEvent = {
      kind: "work-plan",
      phases: ["架空の段A", "架空の段B"],
      current: 0,
      phaseSummary: "",
    }
    const finalOf = (events: readonly SessionEvent[]) =>
      shownReports(turnOf(events, SETTLED, true)).at(-1)

    expect(finalOf([ask, plan, withProgress, finished])).not.toContain("架空の道B")
    expect(finalOf([ask, withProgress, finished])).toContain("架空の道B")
  })

  it("task のあるレポートは、結論を一文の印で包み、task を本文に組まずに運ぶ（畳んだときの先頭行は結論）", () => {
    const task = { kind: "task", id: "X-7", name: "架空の作業", outcome: "stopped" } as const
    const turn = turnOf(
      [ask, report("架空の結論。", "架空の根拠。", "", [], task), finished],
      SETTLED,
      true,
    )

    expect(turn?.steps.find((step) => step.final)?.body).toEqual({
      kind: "text",
      report: `<div class="conclusion">\n\n架空の結論。\n\n</div>\n\n${SECTIONS_START}\n\n架空の根拠。`,
      firstLine: "架空の結論。",
      task,
      finishedPhase: { kind: "none" },
    })
  })

  it("task のあるレポートの結論が空なら、畳んだときの先頭行は作業の名前", () => {
    const task = { kind: "task", id: "X-7", name: "架空の作業", outcome: "stopped" } as const
    const turn = turnOf([ask, report("", "架空の根拠。", "", [], task), finished], SETTLED, true)

    expect(firstLineOf(turn?.steps.find((step) => step.final))).toBe("架空の作業")
  })

  it("節の始まりの印は、結論か検証結果があり節もあるときだけ置く", () => {
    const sectionsOnly = turnOf([ask, report("", "架空の根拠。"), finished], SETTLED, true)
    const conclusionOnly = turnOf([ask, report("架空の結論だけ。"), finished], SETTLED, true)

    expect(shownReports(sectionsOnly)).toEqual(["架空の根拠。"])
    expect(shownReports(conclusionOnly)).toEqual([lead("架空の結論だけ。")])
  })

  it("checks が無ければお願いだけでも合図の行を出さない（お願いの本文は末尾に出る）", () => {
    const turn = turnOf([ask, report("架空の結論。", "", "架空のお願い"), finished], SETTLED, true)

    expect(shownReports(turn)).toEqual([
      `${lead("架空の結論。")}\n\n` +
        '<div class="note note-favor" id="favor-toolu_r1">\n\n架空のお願い\n\n</div>',
    ])
  })

  it("report が呼ばれたターンではツールの外に書いた本文を出さない（資料も締めのテキストも）", () => {
    const turn = turnOf(
      [
        ask,
        text(materialReport("テキストで書いた資料")),
        ...toolRun("toolu_1"),
        report("架空の結論。"),
        { kind: "speech", text: "書けたよ", expression: "default" },
        text("完了"),
        finished,
      ],
      SETTLED,
      true,
    )

    expect(shownReports(turn)).toEqual([lead("架空の結論。")])
    expect(turn?.steps.find((step) => step.final)?.body).toEqual({
      kind: "text",
      report: lead("架空の結論。"),
      firstLine: "架空の結論。",
      task: { kind: "none" },
      finishedPhase: { kind: "none" },
    })
  })

  it("最後の呼び出しが最終レポート、それより前は中間レポートになる", () => {
    const turn = turnOf(
      [ask, report("途中の結論。"), ...toolRun("toolu_1"), report("最後の結論。"), finished],
      SETTLED,
      true,
    )

    expect(shownReports(turn)).toEqual([lead("途中の結論。"), lead("最後の結論。")])
    expect(turn?.steps.flatMap((step) => firstLineOf(step) ?? [])).toEqual([
      "途中の結論。",
      "最後の結論。",
    ])
    const shown = (turn?.steps ?? []).filter((step) => step.body.kind === "text")
    expect(shown.map((step) => step.interim)).toEqual([true, false])
    expect(shown.map((step) => step.final)).toEqual([false, true])
    expect(turn?.hasInterimReport).toBe(true)
  })

  it("最後の report のあとに作業が続いて終わっても、それが最終レポートになる", () => {
    const turn = turnOf(
      [ask, report("唯一の結論。"), ...toolRun("toolu_1"), finished],
      SETTLED,
      true,
    )

    expect(turn?.steps.find((step) => step.final)?.body).toEqual({
      kind: "text",
      report: lead("唯一の結論。"),
      firstLine: "唯一の結論。",
      task: { kind: "none" },
      finishedPhase: { kind: "none" },
    })
  })

  it("動いているあいだは、いちばん新しい report を出さず、それより前は中間レポートとして出す", () => {
    const running = turnOf(
      [ask, report("途中の結論。"), ...toolRun("toolu_1"), report("最後の結論。")],
      WRITING,
      false,
    )

    expect(shownReports(running)).toEqual([lead("途中の結論。")])
    expect(running?.steps.find((step) => step.body.kind === "text")?.interim).toBe(true)
  })

  it("report が呼ばれなかったターンは、同じセッションでも最後の本文を出す", () => {
    const turns = mainViewTurns(
      mainViewEntries(
        fold([
          ask,
          report("前のターンの結論。"),
          finished,
          { kind: "request", text: "次の架空の依頼", images: [] },
          text("テキストで書いた答え"),
          finished,
        ]),
      ),
      SETTLED,
      true,
    )

    expect(turns.map((turn) => shownReports(turn))).toEqual([
      [lead("前のターンの結論。")],
      ["テキストで書いた答え"],
    ])
  })
})

describe("mainViewTurns（段が移ったときの中間レポート）", () => {
  const fold = (events: readonly SessionEvent[]) =>
    events.reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
  const turnOf = (events: readonly SessionEvent[], unsettled: TurnBodies, closed: boolean) =>
    mainViewTurns(mainViewEntries(fold(events)), unsettled, closed).at(-1)
  const ask: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const phases = ["架空の段A", "架空の段B"]
  const plan = (current: number, phaseSummary = "", names = phases): SessionEvent => ({
    kind: "work-plan",
    phases: names,
    current,
    phaseSummary,
  })
  const report: SessionEvent = reportEvent({ toolUseId: "toolu_r1", conclusion: "架空の結論。" })
  const finished: SessionEvent = { kind: "turn-finished", outcome: { kind: "completed" } }

  it("段を進めると、ターンが動いているあいだも終えた段の中間レポートを出す", () => {
    const turn = turnOf([ask, plan(0), plan(1, "架空のまとめ。")], WRITING, false)
    const step = turn?.steps.at(-1)

    expect(step?.interim).toBe(true)
    expect(step?.superseded).toBe(false)
    expect(step?.body).toEqual({
      kind: "text",
      report: "架空のまとめ。",
      firstLine: "1/2 架空の段A",
      task: { kind: "none" },
      finishedPhase: {
        kind: "phase",
        label: "1/2 架空の段A",
        duration: { kind: "known", milliseconds: 0 },
      },
    })
  })

  it("中間レポートには終えた段の所要を記録の時刻から測って載せ、測れなければ不明にする", () => {
    const foldAt = (events: readonly SessionEvent[]) =>
      events.reduce(
        (current, event, index) => applySessionEvent(current, event, index * 7000),
        INITIAL_SESSION_STATE,
      )
    const finishedPhaseOf = (events: readonly SessionEvent[]) => {
      const body = mainViewTurns(mainViewEntries(foldAt(events)), WRITING, false)
        .at(-1)
        ?.steps.at(-1)?.body
      return body?.kind === "text" ? body.finishedPhase : undefined
    }
    const three = ["架空の段A", "架空の段B", "架空の段C"]

    expect(finishedPhaseOf([ask, plan(0), plan(1, "架空のまとめ。")])).toEqual({
      kind: "phase",
      label: "1/2 架空の段A",
      duration: { kind: "known", milliseconds: 7000 },
    })
    expect(
      finishedPhaseOf([ask, plan(1, "架空のまとめ。", three), plan(2, "架空のまとめ。", three)]),
    ).toEqual({
      kind: "phase",
      label: "2/3 架空の段B",
      duration: { kind: "unknown" },
    })
  })

  it("最終レポートが出ると段のまとめは畳まれ、最終レポートのラベルの条件（中間レポートがある）が立つ", () => {
    const turn = turnOf(
      [ask, plan(0), plan(1, "架空のまとめ。"), plan(2), report, finished],
      SETTLED,
      true,
    )
    const [summary, final] = (turn?.steps ?? []).filter((step) => step.body.kind === "text")

    expect(summary?.interim && summary.superseded).toBe(true)
    expect(final?.final).toBe(true)
    expect(reportOf(final)?.startsWith(lead("架空の結論。"))).toBe(true)
    expect(turn?.hasInterimReport).toBe(true)
  })

  it("report の無いターンでも、段のまとめは最終レポートにならない", () => {
    const turn = turnOf(
      [
        ask,
        plan(0),
        plan(1, "架空のまとめ。"),
        { kind: "utterance", text: "架空の答え" },
        finished,
      ],
      SETTLED,
      true,
    )

    expect(turn?.steps.filter((step) => step.interim).map(reportOf)).toEqual(["架空のまとめ。"])
    expect(reportOf(turn?.steps.find((step) => step.final))).toBe("架空の答え")
  })

  it("段が戻っても、終えた段のまとめが無ければ何も出ない", () => {
    const turn = turnOf([ask, plan(0), plan(1, "架空のまとめ。"), plan(0)], WRITING, false)

    expect(turn?.steps.length).toBe(1)
    expect(turn?.steps.at(-1)?.body).toEqual({
      kind: "text",
      report: "架空のまとめ。",
      firstLine: "1/2 架空の段A",
      task: { kind: "none" },
      finishedPhase: {
        kind: "phase",
        label: "1/2 架空の段A",
        duration: { kind: "known", milliseconds: 0 },
      },
    })
  })

  it("1段だけの段取りでは、中間レポートも出ない", () => {
    const single = ["架空の段A"]
    const turn = turnOf(
      [ask, plan(0, "", single), plan(1, "", single), report, finished],
      SETTLED,
      true,
    )

    const shown = turn?.steps.filter((step) => step.body.kind === "text") ?? []

    expect(shown.map((step) => step.final)).toEqual([true])
    expect(turn?.hasInterimReport).toBe(false)
  })

  it("段のまとめも、1つのやり取りで画面に出す記録の上限に数える", () => {
    const many = Array.from({ length: 45 }, (_, index) => `架空の段${String(index)}`)
    const turn = turnOf(
      [
        ask,
        plan(0, "", many),
        ...many.slice(1).map((_, index) => plan(index + 1, "架空のまとめ。", many)),
      ],
      SETTLED,
      true,
    )

    // 44 の段の移り（まとめのみ）= 44 件のうち、上限の 40 件を残す。
    expect(turn?.droppedCount).toBe(4)
  })
})

describe("mainViewEntries（記録ごとの結果の持ち回し）", () => {
  type Timed = readonly [SessionEvent, number]
  const foldTimed = (events: readonly Timed[], from: SessionState = INITIAL_SESSION_STATE) =>
    events.reduce((current, [event, at]) => applySessionEvent(current, event, at), from)
  const ask: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const plan = (current: number, phaseSummary = ""): SessionEvent => ({
    kind: "work-plan",
    phases: ["架空の段A", "架空の段B"],
    current,
    phaseSummary,
  })
  const bashStarted = (id: string, command: string): SessionEvent => ({
    kind: "tool-started",
    toolUseId: id,
    name: "Bash",
    input: { command },
    parentToolUseId: undefined,
  })
  const bashFinished = (id: string): SessionEvent => ({
    kind: "tool-finished",
    toolUseId: id,
    content: "ok",
    isError: false,
  })
  const report = (id: string, command = ""): SessionEvent =>
    reportEvent({
      toolUseId: id,
      conclusion: `架空の結論 ${id}`,
      checks:
        command === ""
          ? []
          : [{ status: "ok", label: "架空の検査", figure: "", command, detail: "" }],
    })
  const reportMarkdowns = (entries: readonly MainViewEntry[]) =>
    entries.flatMap((entry) => (entry.kind === "report" ? [entry.markdown] : []))

  it("記録を足しても、前からある記録の結果は同じ参照のまま返る", () => {
    const before: readonly Timed[] = [
      [ask, 0],
      [bashStarted("toolu_b1", "架空の検査"), 1_000],
      [bashFinished("toolu_b1"), 2_000],
      [plan(0), 3_000],
      [plan(1, "架空のまとめ。"), 4_000],
      [report("toolu_r1", "架空の検査"), 5_000],
    ]
    const stateBefore = foldTimed(before)
    const entriesBefore = mainViewEntries(stateBefore)
    const entriesAfter = mainViewEntries(
      foldTimed(
        [
          [plan(1), 6_000],
          [report("toolu_r2"), 7_000],
        ],
        stateBefore,
      ),
    )

    expect(entriesBefore.length).toBeGreaterThan(3)
    expect(entriesAfter.length).toBeGreaterThan(entriesBefore.length)
    entriesBefore.forEach((entry, index) => {
      expect(entriesAfter[index]).toBe(entry)
    })
  })

  it("report が引く Bash の記録が変わった report だけが作り直され、所要時間が新しくなる", () => {
    const before: readonly Timed[] = [
      [ask, 0],
      [bashStarted("toolu_b1", "架空の検査A"), 1_000],
      [bashFinished("toolu_b1"), 2_000],
      [bashStarted("toolu_b2", "架空の検査B"), 3_000],
      [report("toolu_r1", "架空の検査A"), 4_000],
      [report("toolu_r2", "架空の検査B"), 5_000],
    ]
    const stateBefore = foldTimed(before)
    const entriesBefore = mainViewEntries(stateBefore)
    const entriesAfter = mainViewEntries(
      foldTimed([[bashFinished("toolu_b2"), 8_000]], stateBefore),
    )
    const reportsBefore = entriesBefore.filter((entry) => entry.kind === "report")
    const reportsAfter = entriesAfter.filter((entry) => entry.kind === "report")

    expect(reportsAfter[0]).toBe(reportsBefore[0])
    expect(reportsAfter[1]).not.toBe(reportsBefore[1])
    expect(reportMarkdowns(entriesBefore)[1]).not.toContain("5秒")
    expect(reportMarkdowns(entriesAfter)[1]).toContain('<span class="check-time">5秒</span>')
  })

  it("段取りのある依頼の report には、検証の表の下に段ごとの所要時間の表が出る", () => {
    const markdown = reportMarkdowns(
      mainViewEntries(
        foldTimed([
          [ask, 0],
          [plan(0), 1_000],
          [bashStarted("toolu_b1", "架空の検査"), 2_000],
          [bashFinished("toolu_b1"), 3_000],
          [plan(1, "架空のまとめ。"), 11_000],
          [report("toolu_r1", "架空の検査"), 15_000],
        ]),
      ),
    )[0]

    expect(markdown).toContain(
      '<span class="phase-time-label">1/2 架空の段A</span><span class="phase-time-value">10秒</span>',
    )
    expect(markdown).toContain(
      '<span class="phase-time-label">2/2 架空の段B</span><span class="phase-time-value">4秒</span>',
    )
    expect(markdown?.indexOf('class="phase-times"')).toBeGreaterThan(
      markdown?.indexOf('class="verdict"') ?? Infinity,
    )
  })

  it("段取りの無い依頼の report には、段ごとの所要時間の表を出さない", () => {
    const markdown = reportMarkdowns(
      mainViewEntries(
        foldTimed([
          [ask, 0],
          [report("toolu_r1"), 1_000],
        ]),
      ),
    )[0]

    expect(markdown).not.toContain("phase-times")
  })
})

describe("mainViewTurns（失敗で終わったターン）", () => {
  it("失敗の記録はメインビューのステップに入らず、やり取りの failure に移る", () => {
    const events: readonly SessionEvent[] = [
      { kind: "request", text: "架空の依頼", images: [] },
      { kind: "utterance", text: "架空の本文" },
      { kind: "api-error", error: "overloaded" },
      { kind: "turn-finished", outcome: { kind: "failed", cause: { kind: "api-error" } } },
    ]
    const state = events.reduce(
      (current, event) => applySessionEvent(current, event, 0),
      INITIAL_SESSION_STATE,
    )
    const [turn] = mainViewTurns(mainViewEntries(state), SETTLED, true)

    expect(turn?.failure).toEqual({
      kind: "failed",
      failure: { kind: "api-error", error: "overloaded" },
    })
    expect(turn?.steps).toHaveLength(1)
  })
})

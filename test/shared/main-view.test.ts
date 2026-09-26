import { describe, expect, it } from "bun:test"

import {
  MAX_MAIN_VIEW_TURNS,
  type MainViewEntry,
  type MainViewStep,
  mainViewEntries,
  mainViewTurns,
} from "../../src/shared/main-view.ts"
import { type ReportCheck } from "../../src/shared/report-check.ts"
import { type SessionEvent } from "../../src/shared/session-event.ts"
import {
  applySessionEvent,
  INITIAL_SESSION_STATE,
  type TurnBodies,
} from "../../src/shared/session-state.ts"

/** いちばん新しいやり取りの本文がどれも確定している（ターンが終わっている）。 */
const SETTLED = { report: false, utterance: false } as const satisfies TurnBodies
/** いま走っている SDK ターンで `report` もツールの外の本文も届いている。 */
const WRITING = { report: true, utterance: true } as const satisfies TurnBodies

/** 本文を持つステップならその本文。持たなければ（ステップが無ければ）undefined。 */
const reportOf = (step: MainViewStep | undefined) =>
  step?.body.kind === "text" ? step.body.report : undefined
const firstLineOf = (step: MainViewStep | undefined) =>
  step?.body.kind === "text" ? step.body.firstLine : undefined

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
  status: { kind: "finished", result: { content: "ok", isError: false } },
})
/** `report` ツールで受け取ったレポート（引数を組んだあとの形）。中間レポートはここからしか生まれない。 */
const toolReport = (markdown: string): MainViewEntry => ({ kind: "report", markdown })
/** 見出しと箇条書きを持つ本文。資料らしい形でも `report` の外なら出ないことを確かめるのに使う。 */
const materialReport = (label: string): string => `## ${label}\n\n- 1つ目の発見\n- 2つ目の発見`

const question = (text: string): MainViewEntry => ({
  kind: "question",
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

    const turns = mainViewTurns(entries, SETTLED)

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
    )

    const steps = turns[0]?.steps ?? []
    expect(steps).toHaveLength(2)
    expect(steps[0]?.actions).toHaveLength(1)
    expect(steps[1]?.actions).toHaveLength(1)
  })

  it("レポートより前に実行されたツールは、レポートを持たないステップになる", () => {
    const turns = mainViewTurns(
      [request("依頼"), edit("src/first.ts"), detail("あとから説明")],
      SETTLED,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps).toHaveLength(2)
    expect(reportOf(steps[0])).toBeUndefined()
    expect(reportOf(steps[1])).toBe("あとから説明")
  })

  it("画面に出す記録が上限を超えたら、古いほうから落として件数を残す", () => {
    const entries = [
      request("依頼"),
      ...Array.from({ length: 45 }, (_, index) =>
        toolReport(materialReport(`レポート${String(index)}`)),
      ),
    ]

    const turns = mainViewTurns(entries, SETTLED)

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

    const turns = mainViewTurns(entries, SETTLED)

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

    const before = mainViewTurns(entries, SETTLED)
    const idsBefore = (before[0]?.steps ?? []).map((step) => step.id)

    // さらに記録が積まれ、前の呼び出しでは残っていたステップも古いほうから落ちる。
    const after = mainViewTurns([...entries, toolReport(materialReport("レポート45"))], SETTLED)
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
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => reportOf(step))).toEqual([undefined, "A made-up English line."])
    expect(steps.map((step) => step.final)).toEqual([false, true])
  })

  it("空白だけの本文は選ばず、その手前の本文を最終レポートにする", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail("架空の答え。"), detail("\u200B \n")],
      SETTLED,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => reportOf(step))).toEqual(["架空の答え。", undefined])
    expect(steps.map((step) => step.final)).toEqual([true, false])
  })

  it("短い返事だけのターン（ツールを1度も呼ばない）でも、締めの本文は残る", () => {
    const turns = mainViewTurns([request("依頼"), detail("文章だけで答える")], SETTLED)

    expect(reportOf(turns[0]?.steps[0])).toBe("文章だけで答える")
    expect(turns[0]?.steps[0]?.final).toBe(true)
  })

  it("質問の直前に書いた本文が最後なら、それが最終レポートになる", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail("比べた結果はこう"), question("どれにする？")],
      SETTLED,
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
    )

    const firstLine = firstLineOf(turns[0]?.steps[0]) ?? ""
    expect(firstLine.endsWith("…")).toBe(true)
    expect(firstLine.length).toBeLessThan(longHeading.length)
  })

  it("本文を持たないステップの body は none（先頭行も持たない）", () => {
    const turns = mainViewTurns(
      [request("依頼"), edit("src/first.ts"), detail("あとから説明")],
      SETTLED,
    )

    expect(turns[0]?.steps[0]?.body).toEqual({ kind: "none" })
  })
})

describe("mainViewTurns（最終レポートの印）", () => {
  const interim = "## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"

  it("中間レポートには立たない（動いているあいだ、出ている本文がそれしか無くても）", () => {
    const turns = mainViewTurns(
      [request("依頼"), toolReport(interim), edit("src/a.ts"), toolReport("書きかけの結論")],
      WRITING,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => step.interim)).toEqual([true, false])
    expect(steps.map((step) => step.final)).toEqual([false, false])
  })
})

describe("mainViewTurns（締めの speak → レポートで終える並び）", () => {
  // 締めの `speak` のあとに本文で終える並びを、SDK から届くイベントの形で流す。**締めの `speak` は
  // `speech` になって本文の記録にならない**ので、そのあとの本文が最後の本文のまま残る。
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
    return mainViewTurns(mainViewEntries(state), SETTLED)[0]?.steps ?? []
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
    )

    expect((turns[0]?.steps ?? []).map((step) => reportOf(step))).toEqual([undefined, undefined])
  })

  it("書きかけのあいだは final が立たない（書き上げる演出が途中の本文を相手にしない）", () => {
    const streaming = mainViewTurns([request("依頼"), detail(material)], WRITING)
    const settled = mainViewTurns([request("依頼"), detail(material)], SETTLED)

    expect(streaming[0]?.steps.map((step) => step.final)).toEqual([false])
    expect(settled[0]?.steps.map((step) => step.final)).toEqual([true])
  })

  it("進行中に隠すのはいちばん新しいターンだけで、前のターンの最終レポートは残る", () => {
    const turns = mainViewTurns(
      [request("前の依頼"), detail("直したよ"), request("今回の依頼"), detail("まず読むね")],
      WRITING,
    )

    expect(reportOf(turns[0]?.steps[0])).toBe("直したよ")
    expect(reportOf(turns[1]?.steps[0])).toBeUndefined()
  })
})

describe("mainViewTurns（report ツールで受け取ったレポート）", () => {
  // フィクスチャはすべて手で書いた架空の本文（docs/coding-standards.md「会話内容の扱い」）。
  const fold = (events: readonly SessionEvent[]) =>
    events.reduce((current, event) => applySessionEvent(current, event, 0), INITIAL_SESSION_STATE)
  const turnOf = (events: readonly SessionEvent[], unsettled: TurnBodies) =>
    mainViewTurns(mainViewEntries(fold(events)), unsettled).at(-1)
  const ask: SessionEvent = { kind: "request", text: "架空の依頼", images: [] }
  const text = (markdown: string): SessionEvent => ({ kind: "utterance", text: markdown })
  const report = (
    conclusion: string,
    body = "",
    favor = "",
    checks: readonly ReportCheck[] = [],
  ): SessionEvent => ({
    kind: "report",
    toolUseId: "toolu_r1",
    conclusion,
    body,
    favor,
    checks,
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
    )

    expect(shownReports(turn)).toEqual([
      '架空の結論。\n\n| 列 |\n| --- |\n| 値 |\n\n<div class="note note-favor">\n\n架空のお願い\n\n</div>',
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
    )

    expect(shownReports(turn)).toEqual([
      '架空の結論。\n\n架空の根拠。\n\n<div class="note note-favor">\n\n架空のお願い\n\n</div>',
    ])
  })

  it("report が呼ばれなかったターンの本文には整形を掛けない", () => {
    const turn = turnOf([ask, text("架空の答え。\n\n以上です。"), finished], SETTLED)

    expect(shownReports(turn)).toEqual(["架空の答え。\n\n以上です。"])
  })

  it("checks は結論のすぐ下に検証結果の帯として組む（body・favor より前）", () => {
    const turn = turnOf(
      [
        ask,
        report("架空の結論。", "架空の根拠。", "架空のお願い", [
          { status: "ok", label: "架空の検査", detail: "架空の件数" },
          { status: "unverified", label: "架空の目視", detail: "" },
        ]),
        finished,
      ],
      SETTLED,
    )

    expect(shownReports(turn)).toEqual([
      "架空の結論。\n\n" +
        '<div class="checks">' +
        '<div class="check"><span class="badge badge-ok">OK</span> <b>架空の検査</b> 架空の件数</div>' +
        '<div class="check"><span class="badge badge-warn">未確認</span> <b>架空の目視</b></div>' +
        "</div>\n\n" +
        '架空の根拠。\n\n<div class="note note-favor">\n\n架空のお願い\n\n</div>',
    ])
    expect(firstLineOf(turn?.steps[0])).toBe("架空の結論。")
  })

  it("checks・body・favor が空ならその塊を置かない（帯も出ない）", () => {
    const turn = turnOf([ask, report("架空の結論だけ。"), finished], SETTLED)

    expect(shownReports(turn)).toEqual(["架空の結論だけ。"])
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
    )

    expect(shownReports(turn)).toEqual(["架空の結論。"])
    expect(turn?.steps.find((step) => step.final)?.body).toEqual({
      kind: "text",
      report: "架空の結論。",
      firstLine: "架空の結論。",
    })
  })

  it("最後の呼び出しが最終レポート、それより前は中間レポートになる", () => {
    const turn = turnOf(
      [ask, report("途中の結論。"), ...toolRun("toolu_1"), report("最後の結論。"), finished],
      SETTLED,
    )

    expect(shownReports(turn)).toEqual(["途中の結論。", "最後の結論。"])
    const shown = (turn?.steps ?? []).filter((step) => step.body.kind === "text")
    expect(shown.map((step) => step.interim)).toEqual([true, false])
    expect(shown.map((step) => step.final)).toEqual([false, true])
    expect(turn?.hasInterimReport).toBe(true)
  })

  it("最後の report のあとに作業が続いて終わっても、それが最終レポートになる", () => {
    const turn = turnOf([ask, report("唯一の結論。"), ...toolRun("toolu_1"), finished], SETTLED)

    expect(turn?.steps.find((step) => step.final)?.body).toEqual({
      kind: "text",
      report: "唯一の結論。",
      firstLine: "唯一の結論。",
    })
  })

  it("動いているあいだは、いちばん新しい report を出さず、それより前は中間レポートとして出す", () => {
    const running = turnOf(
      [ask, report("途中の結論。"), ...toolRun("toolu_1"), report("最後の結論。")],
      WRITING,
    )

    expect(shownReports(running)).toEqual(["途中の結論。"])
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
    )

    expect(turns.map((turn) => shownReports(turn))).toEqual([
      ["前のターンの結論。"],
      ["テキストで書いた答え"],
    ])
  })
})

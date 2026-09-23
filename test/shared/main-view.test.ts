import { describe, expect, it } from "bun:test"

import {
  MAX_MAIN_VIEW_TURNS,
  type MainViewEntry,
  type MainViewStep,
  mainViewTurns,
} from "../../src/shared/main-view.ts"

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
/**
 * まとまった資料（構造の印を持ち、短くない本文）。**実況として落ちない本文**が要るところで使う
 * （`selectShownReports` は印の無い本文を、締めの本文でなければ落とす）。
 */
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
      false,
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

    const turns = mainViewTurns(entries, false)

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
      false,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps).toHaveLength(2)
    expect(steps[0]?.actions).toHaveLength(1)
    expect(steps[1]?.actions).toHaveLength(1)
  })

  it("レポートより前に実行されたツールは、レポートを持たないステップになる", () => {
    const turns = mainViewTurns(
      [request("依頼"), edit("src/first.ts"), detail("あとから説明")],
      false,
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
        detail(materialReport(`レポート${String(index)}`)),
      ),
    ]

    const turns = mainViewTurns(entries, false)

    expect(turns[0]?.droppedCount).toBeGreaterThan(0)
    expect(reportOf(turns[0]?.steps.at(-1))).toBe(materialReport("レポート44"))
    expect(reportOf(turns[0]?.steps[0])).not.toBe(materialReport("レポート0"))
  })

  it("ツールの実行は上限に数えない（何十件呼んでも落ちない）", () => {
    const entries = [
      request("依頼"),
      detail("## 調べた結果\n\n- 1つめ\n- 2つめ\n"),
      ...Array.from({ length: 60 }, (_, index) => edit(`src/file${String(index)}.ts`)),
      detail(materialReport("直した")),
    ]

    const turns = mainViewTurns(entries, false)

    expect(turns[0]?.droppedCount).toBe(0)
    expect(reportOf(turns[0]?.steps[0])).toBe("## 調べた結果\n\n- 1つめ\n- 2つめ\n")
    expect(reportOf(turns[0]?.steps.at(-1))).toBe(materialReport("直した"))
  })

  it("上限を超えて古いステップが落ちても、残ったステップの id は変わらない（T-165）", () => {
    const entries = [
      request("依頼"),
      ...Array.from({ length: 45 }, (_, index) =>
        detail(materialReport(`レポート${String(index)}`)),
      ),
    ]

    const before = mainViewTurns(entries, false)
    const idsBefore = (before[0]?.steps ?? []).map((step) => step.id)

    // さらに記録が積まれ、前の呼び出しでは残っていたステップも古いほうから落ちる。
    const after = mainViewTurns([...entries, detail(materialReport("レポート45"))], false)
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

  it("短い実況は、ツールが続いた時点で落ちる（構造の印が無い）", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail("まず `src/a.ts` を読むね。それから直す。"), edit("src/a.ts")],
      false,
    )

    expect(reportOf(turns[0]?.steps[0])).toBeUndefined()
  })

  it("構造の印を持つまとまった本文は、ツールが続いても中間レポートとして残る", () => {
    const turns = mainViewTurns(
      [
        request("依頼"),
        detail("## 調べた結果\n\n| 場所 | 状態 |\n| --- | --- |\n| src/a.ts | 直す |"),
        edit("src/a.ts"),
      ],
      false,
    )

    const step = turns[0]?.steps[0]
    expect(reportOf(step)).toBe(
      "## 調べた結果\n\n| 場所 | 状態 |\n| --- | --- |\n| src/a.ts | 直す |",
    )
    expect(step?.interim).toBe(true)
  })

  it("構造の印があっても短ければ実況として落とす（迷ったら落とす側）", () => {
    const turns = mainViewTurns([request("依頼"), detail("- まず読むね"), edit("src/a.ts")], false)

    expect(reportOf(turns[0]?.steps[0])).toBeUndefined()
  })

  it("構造の印が無ければ、長くても落とす", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail("これから直す。".repeat(60)), edit("src/a.ts")],
      false,
    )

    expect(reportOf(turns[0]?.steps[0])).toBeUndefined()
  })

  it("見出し1行と長い段落だけの本文も、文字数の下限で中間レポートになる", () => {
    const markdown = `## 調べた結果\n\n${"この段落は行数こそ伸びないが、まとまった分量のある資料である。".repeat(8)}`
    const turns = mainViewTurns([request("依頼"), detail(markdown), edit("src/a.ts")], false)

    const step = turns[0]?.steps[0]
    expect(reportOf(step)).toBe(markdown)
    expect(step?.interim).toBe(true)
  })

  it("中間レポートは1つのやり取りに何件でも積む（最後の1つに絞らない）", () => {
    const first = "## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"
    const second = "## 直した箇所\n\n- src/a.ts\n- src/b.ts"
    const third = materialReport("片付いた")
    const turns = mainViewTurns(
      [
        request("依頼"),
        detail(first),
        edit("src/a.ts"),
        detail(second),
        edit("src/b.ts"),
        detail(third),
      ],
      false,
    )

    expect((turns[0]?.steps ?? []).map((step) => reportOf(step))).toEqual([first, second, third])
    expect((turns[0]?.steps ?? []).map((step) => step.interim)).toEqual([true, true, false])
  })

  it("ツール呼び出しが続いた本文は落とし、最後に書いた本文だけを残す", () => {
    const turns = mainViewTurns(
      [
        request("依頼"),
        detail("まず読むね"),
        edit("src/a.ts"),
        detail("次に直すね"),
        edit("src/b.ts"),
        detail("直した結果はこう"),
      ],
      false,
    )

    expect((turns[0]?.steps ?? []).map((step) => reportOf(step))).toEqual([
      undefined,
      undefined,
      "直した結果はこう",
    ])
  })

  it("短い返事だけのターン（ツールを1度も呼ばない）でも、締めの本文は残る", () => {
    const turns = mainViewTurns([request("依頼"), detail("文章だけで答える")], false)

    expect(reportOf(turns[0]?.steps[0])).toBe("文章だけで答える")
    expect(turns[0]?.steps[0]?.final).toBe(true)
  })

  it("ツールが1つも続かない実況でも、次の本文が出た時点で落ちる（`speak` を挟む並び）", () => {
    // 本文（実況1）→ `speak` → 本文（実況2）→ ツール → 最終レポート、という規約どおりの並び。
    // `speak` は `speech` になって `tool` の記録にならないので、実況1にはツールが1つも付かない。
    const turns = mainViewTurns(
      [
        request("依頼"),
        detail("さいしょに資料を読むね。"),
        detail("つづいて `src/a.ts` を直すね。"),
        edit("src/a.ts"),
        detail(materialReport("直した結果")),
      ],
      false,
    )

    expect((turns[0]?.steps ?? []).map((step) => reportOf(step))).toEqual([
      undefined,
      undefined,
      materialReport("直した結果"),
    ])
  })

  it("ツールが1つも続かなくても、まとまった資料は中間レポートとして残る", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail(materialReport("調べた結果")), detail(materialReport("片付いた"))],
      false,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => reportOf(step))).toEqual([
      materialReport("調べた結果"),
      materialReport("片付いた"),
    ])
    expect(steps.map((step) => step.interim)).toEqual([true, false])
  })

  it("質問はツールに数えないので、質問の直前に書いた本文は残る", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail("比べた結果はこう"), question("どれにする？")],
      false,
    )

    const steps = turns[0]?.steps ?? []
    expect(reportOf(steps[0])).toBe("比べた結果はこう")
    expect(steps[0]?.actions).toHaveLength(1)
    // 質問の直前の本文は「レポート本体」であって、中間レポートにはしない。
    expect(steps[0]?.interim).toBe(false)
  })

  it("落とすのは本文だけで、続いた出来事はステップに残る", () => {
    const turns = mainViewTurns([request("依頼"), detail("まず直すね"), edit("src/a.ts")], false)

    const steps = turns[0]?.steps ?? []
    expect(steps).toHaveLength(1)
    expect(reportOf(steps[0])).toBeUndefined()
    expect(steps[0]?.actions).toHaveLength(1)
  })

  it("最初の依頼より前の記録も、request 無しのターンとして残す", () => {
    const turns = mainViewTurns(
      [detail("依頼より前のレポート"), request("依頼"), detail("今回")],
      false,
    )

    expect(turns).toHaveLength(2)
    expect(turns[0]?.request).toBeUndefined()
    expect(reportOf(turns[0]?.steps[0])).toBe("依頼より前のレポート")
  })
})

describe("mainViewTurns（追い越された中間レポートを畳む印。T-161）", () => {
  it("後ろにレポートを持つステップがあれば superseded が立つ", () => {
    const first = "## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"
    const turns = mainViewTurns(
      [request("依頼"), detail(first), edit("src/a.ts"), detail(materialReport("片付いた"))],
      false,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => step.interim)).toEqual([true, false])
    expect(steps.map((step) => step.superseded)).toEqual([true, false])
  })

  it("いちばん後ろの中間レポート（まだ追い越されていない）には superseded が立たない", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"), edit("src/a.ts")],
      false,
    )

    expect(turns[0]?.steps[0]?.interim).toBe(true)
    expect(turns[0]?.steps[0]?.superseded).toBe(false)
  })

  it("<summary> に出す文字列は先頭行から作られる（見出しなら記号を落としてその語）", () => {
    const turns = mainViewTurns(
      [
        request("依頼"),
        detail("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
        edit("src/a.ts"),
        detail("できたよ"),
      ],
      false,
    )

    expect(firstLineOf(turns[0]?.steps[0])).toBe("調べた結果")
  })

  it("見出しでない先頭行は記号を落とさずそのまま使う", () => {
    const turns = mainViewTurns(
      [
        request("依頼"),
        detail("| 場所 | 状態 |\n| --- | --- |\n| src/a.ts | 直す |\n| src/b.ts | 直す |"),
        edit("src/a.ts"),
        detail("できたよ"),
      ],
      false,
    )

    expect(firstLineOf(turns[0]?.steps[0])).toBe("| 場所 | 状態 |")
  })

  it("先頭行が長いときは省略記号で切る", () => {
    const longHeading = `## ${"とても長い見出し".repeat(10)}`
    const turns = mainViewTurns(
      [
        request("依頼"),
        detail(`${longHeading}\n\n- 1つ目の発見\n- 2つ目の発見`),
        edit("src/a.ts"),
        detail("できたよ"),
      ],
      false,
    )

    const firstLine = firstLineOf(turns[0]?.steps[0]) ?? ""
    expect(firstLine.endsWith("…")).toBe(true)
    expect(firstLine.length).toBeLessThan(longHeading.length)
  })

  it("本文を持たないステップの body は none（先頭行も持たない）", () => {
    const turns = mainViewTurns(
      [request("依頼"), edit("src/first.ts"), detail("あとから説明")],
      false,
    )

    expect(turns[0]?.steps[0]?.body).toEqual({ kind: "none" })
  })
})

describe("mainViewTurns（最終レポートの印）", () => {
  const interim = "## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"

  it("最後の、中間でない本文に final が立つ", () => {
    const turns = mainViewTurns(
      [request("依頼"), detail(interim), edit("src/a.ts"), detail(materialReport("片付いた"))],
      false,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => step.final)).toEqual([false, true])
  })

  it("締めが実況でしかないときは落とし、最後の資料を最終レポートへ繰り上げる", () => {
    // 規約どおりの並び（資料 → `speak` → 締めの一言）。挨拶が位置だけで席を取っていた。
    // `speak` は `speech` になるのでステップの区切りにしか出てこない。
    const turns = mainViewTurns(
      [request("依頼"), detail(interim), detail("狐火を落とします。また呼んでください。")],
      false,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => reportOf(step))).toEqual([interim, undefined])
    expect(steps.map((step) => step.interim)).toEqual([false, false])
    expect(steps.map((step) => step.final)).toEqual([true, false])
    // 繰り上げた1件しか残らないので、「最終レポート」のラベルは出さない。
    expect(turns[0]?.hasInterimReport).toBe(false)
  })

  it("繰り上げても、手前の資料は中間レポートのまま残る（最後の1つだけが上がる）", () => {
    const turns = mainViewTurns(
      [
        request("依頼"),
        detail(materialReport("調べた")),
        edit("src/a.ts"),
        detail(materialReport("直した")),
        detail("では、また。"),
      ],
      false,
    )

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => step.interim)).toEqual([true, false, false])
    expect(steps.map((step) => step.final)).toEqual([false, true, false])
    expect(turns[0]?.hasInterimReport).toBe(true)
  })

  it("資料が1つも無ければ、締めの短い本文はそのまま最終レポートになる", () => {
    const turns = mainViewTurns(
      [request("依頼"), edit("src/a.ts"), detail("直しておいたよ")],
      false,
    )

    const steps = turns[0]?.steps ?? []
    expect(reportOf(steps.at(-1))).toBe("直しておいたよ")
    expect(steps.at(-1)?.final).toBe(true)
  })

  it("進行中は繰り上げず、ツールの続いていない資料も出さない（締めか中間かが決まっていない）", () => {
    const turns = mainViewTurns([request("依頼"), detail(interim), detail("では、ま")], true)

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => reportOf(step))).toEqual([undefined, undefined])
    expect(steps.map((step) => step.interim)).toEqual([false, false])
    expect(steps.map((step) => step.final)).toEqual([false, false])
  })

  it("実況のあとに終わると、伏せていた資料がそのまま最終レポートとして初めて出る", () => {
    // **演出（`hooks/use-report-reveal.ts`）が掛かる条件**。中間レポートとして先に出してしまうと、
    // 本文の箱が「演出の対象ではない」状態で組み立てられ、繰り上げても筆が入らない。
    const entries = [request("依頼"), detail(interim), detail("片付いたよ。また呼んでくれ。")]

    const writing = mainViewTurns(entries, true)[0]?.steps ?? []
    const settled = mainViewTurns(entries, false)[0]?.steps ?? []

    expect(writing.map((step) => reportOf(step))).toEqual([undefined, undefined])
    expect(settled.map((step) => reportOf(step))).toEqual([interim, undefined])
    expect(settled.map((step) => step.final)).toEqual([true, false])
  })

  it("中間レポートには立たない（本文がそれしか無くても）", () => {
    const turns = mainViewTurns([request("依頼"), detail(interim), edit("src/a.ts")], false)

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => step.interim)).toEqual([true])
    expect(steps.map((step) => step.final)).toEqual([false])
  })

  it("中間レポートがあるやり取りだけ hasInterimReport が立つ（ラベルを出す条件）", () => {
    const withInterim = mainViewTurns(
      [request("依頼"), detail(interim), edit("src/a.ts"), detail(materialReport("片付いた"))],
      false,
    )
    const alone = mainViewTurns([request("依頼"), detail("できたよ")], false)

    expect(withInterim[0]?.hasInterimReport).toBe(true)
    expect(alone[0]?.hasInterimReport).toBe(false)
    expect(alone[0]?.steps.map((step) => step.final)).toEqual([true])
  })
})

describe("mainViewTurns（ターンが進行中のあいだは、確定していない本文を出さない）", () => {
  const material = "## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"

  it("流れている実況が積まれてもツールが始まっても、前の中間レポートの superseded が反転しない", () => {
    const streaming = mainViewTurns(
      [request("依頼"), detail(material), edit("src/a.ts"), detail("次は直すね")],
      true,
    )
    const afterToolStarted = mainViewTurns(
      [request("依頼"), detail(material), edit("src/a.ts"), detail("次は直すね"), edit("src/b.ts")],
      true,
    )

    expect(streaming[0]?.steps[0]?.superseded).toBe(false)
    expect(afterToolStarted[0]?.steps[0]?.superseded).toBe(false)
  })

  it("進行中は、いちばん新しいターンの最後のステップの実況を出さない", () => {
    const turns = mainViewTurns([request("依頼"), detail("まず `src/a.ts` を読むね")], true)

    expect(reportOf(turns[0]?.steps[0])).toBeUndefined()
  })

  it("進行中は、資料と判定できる本文でも、ツールが付くまで出さない", () => {
    const turns = mainViewTurns([request("依頼"), detail(material)], true)

    expect(reportOf(turns[0]?.steps[0])).toBeUndefined()
  })

  it("書きかけのあいだは final が立たない（書き上げる演出が途中の本文を相手にしない）", () => {
    const streaming = mainViewTurns([request("依頼"), detail(material)], true)
    const settled = mainViewTurns([request("依頼"), detail(material)], false)

    expect(streaming[0]?.steps.map((step) => step.final)).toEqual([false])
    expect(settled[0]?.steps.map((step) => step.final)).toEqual([true])
  })

  it("ツールが付いた資料は、出たその時点から中間レポート（囲いが実線から反転しない）", () => {
    const beforeTool = mainViewTurns([request("依頼"), detail(material)], true)
    const afterTool = mainViewTurns([request("依頼"), detail(material), edit("src/a.ts")], true)

    expect(reportOf(beforeTool[0]?.steps[0])).toBeUndefined()
    expect(reportOf(afterTool[0]?.steps[0])).toBe(material)
    expect(afterTool[0]?.steps[0]?.interim).toBe(true)
    expect(afterTool[0]?.steps[0]?.final).toBe(false)
  })

  it("質問はツールに数えないので、その手前の本文は進行中のあいだ出ない", () => {
    const turns = mainViewTurns([request("依頼"), detail(material), question("どっち？")], true)

    expect(reportOf(turns[0]?.steps[0])).toBeUndefined()
  })

  it("ターンが終われば、短い最終レポートも出る", () => {
    const turns = mainViewTurns([request("依頼"), detail("直したよ")], false)

    expect(reportOf(turns[0]?.steps[0])).toBe("直したよ")
  })

  it("進行中に次の本文が始まっても、ツールの続かない実況は露出しない", () => {
    // 実況1が「最後のステップ」でなくなった瞬間に出てしまう経路（塞いだ）。
    const turns = mainViewTurns(
      [request("依頼"), detail("さいしょに資料を読むね。"), detail("つづいて ")],
      true,
    )

    expect((turns[0]?.steps ?? []).map((step) => reportOf(step))).toEqual([undefined, undefined])
  })

  it("進行中は、次の本文が始まっただけでは資料を出さない（ツールが付くまで待つ）", () => {
    const turns = mainViewTurns([request("依頼"), detail(material), detail("つづいて ")], true)

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => reportOf(step))).toEqual([undefined, undefined])
    expect(steps.map((step) => step.interim)).toEqual([false, false])
  })

  it("進行中でも、ツールが付いた資料は中間レポートとして出る", () => {
    const turns = mainViewTurns([request("依頼"), detail(material), edit("src/a.ts")], true)

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => reportOf(step))).toEqual([material])
    expect(steps.map((step) => step.interim)).toEqual([true])
  })

  it("進行中に隠すのはいちばん新しいターンだけで、前のターンの最終レポートは残る", () => {
    const turns = mainViewTurns(
      [request("前の依頼"), detail("直したよ"), request("今回の依頼"), detail("まず読むね")],
      true,
    )

    expect(reportOf(turns[0]?.steps[0])).toBe("直したよ")
    expect(reportOf(turns[1]?.steps[0])).toBeUndefined()
  })
})

// `mainViewTurns` の窓・ステップへのまとめ・本文の選び方と最終レポートの印。
import { describe, expect, it } from "vitest"

import { mainViewTurns } from "../../../../src/browser/domain/main-view/main-view.ts"
import { MAX_SESSION_STATE_TURNS } from "../../../../src/shared/session/session-record.ts"
import {
  detail,
  edit,
  firstLineOf,
  materialReport,
  question,
  reportOf,
  request,
  SETTLED,
  toolReport,
  WRITING,
} from "../../../fixture/main-view-entry.ts"

/** メインビューに出すやり取りの数（仕事の記録の窓と同じ）。 */
const MAX_MAIN_VIEW_TURNS = MAX_SESSION_STATE_TURNS.work

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
  // バックグラウンドタスクが残っている・続きのターンが動いているなど、やり取りそのものはまだ閉じていない
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

import { describe, expect, it } from "bun:test"

import { MAX_MAIN_VIEW_TURNS, mainViewTurns } from "../../src/protocol/main-view.ts"
import { type MainViewEntry } from "../../src/protocol/session-state.ts"

const request = (text: string): MainViewEntry => ({ kind: "request", text })
const detail = (markdown: string): MainViewEntry => ({ kind: "detail", markdown })
const edit = (path: string): MainViewEntry => ({
  kind: "tool",
  name: "Edit",
  input: { file_path: path },
  result: { content: "ok", isError: false },
})
const question = (text: string): MainViewEntry => ({
  kind: "question",
  questions: [{ header: "架空", text, multiSelect: false, options: [] }],
  answers: [],
})

describe("mainViewTurns（依頼で区切り、直近5件に絞る）", () => {
  it("依頼を境目にやり取りへ分ける", () => {
    const turns = mainViewTurns([
      request("前の依頼"),
      detail("前のレポート"),
      request("今回の依頼"),
      detail("今回のレポート"),
    ])

    expect(turns.map((turn) => turn.request)).toEqual(["前の依頼", "今回の依頼"])
    expect(turns[0]?.steps[0]?.report).toBe("前のレポート")
    expect(turns[1]?.steps[0]?.report).toBe("今回のレポート")
  })

  it(`直近${String(MAX_MAIN_VIEW_TURNS)}件だけを昇順で残す（6件以上流しても絞られる）`, () => {
    const turnCount = MAX_MAIN_VIEW_TURNS + 3
    const entries = Array.from({ length: turnCount }, (_, index) => [
      request(`依頼${String(index)}`),
      detail(`レポート${String(index)}`),
    ]).flat()

    const turns = mainViewTurns(entries)

    expect(turns).toHaveLength(MAX_MAIN_VIEW_TURNS)
    expect(turns.map((turn) => turn.request)).toEqual(
      Array.from({ length: MAX_MAIN_VIEW_TURNS }, (_, index) => {
        const originalIndex = turnCount - MAX_MAIN_VIEW_TURNS + index
        return `依頼${String(originalIndex)}`
      }),
    )
  })

  it("レポートとその後のツールの実行が1つのステップにまとまる", () => {
    const turns = mainViewTurns([
      request("依頼"),
      detail("まず読むね"),
      edit("src/a.ts"),
      detail("次に直すね"),
      edit("src/b.ts"),
    ])

    const steps = turns[0]?.steps ?? []
    expect(steps).toHaveLength(2)
    expect(steps[0]?.actions).toHaveLength(1)
    expect(steps[1]?.actions).toHaveLength(1)
  })

  it("レポートより前に実行されたツールは、レポートを持たないステップになる", () => {
    const turns = mainViewTurns([request("依頼"), edit("src/first.ts"), detail("あとから説明")])

    const steps = turns[0]?.steps ?? []
    expect(steps).toHaveLength(2)
    expect(steps[0]?.report).toBeUndefined()
    expect(steps[1]?.report).toBe("あとから説明")
  })

  it("画面に出す記録が上限を超えたら、古いほうから落として件数を残す", () => {
    const entries = [
      request("依頼"),
      ...Array.from({ length: 45 }, (_, index) => detail(`レポート${String(index)}`)),
    ]

    const turns = mainViewTurns(entries)

    expect(turns[0]?.droppedCount).toBeGreaterThan(0)
    expect(turns[0]?.steps.at(-1)?.report).toBe("レポート44")
    expect(turns[0]?.steps[0]?.report).not.toBe("レポート0")
  })

  it("ツールの実行は上限に数えない（何十件呼んでも落ちない）", () => {
    const entries = [
      request("依頼"),
      detail("## 調べた結果\n\n- 1つめ\n- 2つめ\n"),
      ...Array.from({ length: 60 }, (_, index) => edit(`src/file${String(index)}.ts`)),
      detail("直したよ"),
    ]

    const turns = mainViewTurns(entries)

    expect(turns[0]?.droppedCount).toBe(0)
    expect(turns[0]?.steps[0]?.report).toBe("## 調べた結果\n\n- 1つめ\n- 2つめ\n")
    expect(turns[0]?.steps.at(-1)?.report).toBe("直したよ")
  })

  it("上限を超えて古いステップが落ちても、残ったステップの id は変わらない（T-165）", () => {
    const entries = [
      request("依頼"),
      ...Array.from({ length: 45 }, (_, index) => detail(`レポート${String(index)}`)),
    ]

    const before = mainViewTurns(entries)
    const idsBefore = (before[0]?.steps ?? []).map((step) => step.id)

    // さらに記録が積まれ、前の呼び出しでは残っていたステップも古いほうから落ちる。
    const after = mainViewTurns([...entries, detail("レポート45")])
    const idsAfter = (after[0]?.steps ?? []).map((step) => step.id)

    // 両方に残っているステップ（id の交わり）は、report の中身も id も変わらない。
    const commonIds = idsAfter.filter((id) => idsBefore.includes(id))
    expect(commonIds.length).toBeGreaterThan(0)
    for (const id of commonIds) {
      const stepBefore = before[0]?.steps.find((step) => step.id === id)
      const stepAfter = after[0]?.steps.find((step) => step.id === id)
      expect(stepAfter?.report).toBe(stepBefore?.report)
    }
    // id は作られた順の通し番号なので、添字（0始まりで詰め直したもの）とは違い連番のまま維持される。
    expect(idsAfter[0]).toBeGreaterThan(idsBefore[0] ?? -1)
  })

  it("短い実況は、ツールが続いた時点で落ちる（構造の印が無い）", () => {
    const turns = mainViewTurns([
      request("依頼"),
      detail("まず `src/a.ts` を読むね。それから直す。"),
      edit("src/a.ts"),
    ])

    expect(turns[0]?.steps[0]?.report).toBeUndefined()
  })

  it("構造の印を持つまとまった本文は、ツールが続いても中間レポートとして残る", () => {
    const turns = mainViewTurns([
      request("依頼"),
      detail("## 調べた結果\n\n| 場所 | 状態 |\n| --- | --- |\n| src/a.ts | 直す |"),
      edit("src/a.ts"),
    ])

    const step = turns[0]?.steps[0]
    expect(step?.report).toBe(
      "## 調べた結果\n\n| 場所 | 状態 |\n| --- | --- |\n| src/a.ts | 直す |",
    )
    expect(step?.interim).toBe(true)
  })

  it("構造の印があっても短ければ実況として落とす（迷ったら落とす側）", () => {
    const turns = mainViewTurns([request("依頼"), detail("- まず読むね"), edit("src/a.ts")])

    expect(turns[0]?.steps[0]?.report).toBeUndefined()
  })

  it("構造の印が無ければ、長くても落とす", () => {
    const turns = mainViewTurns([
      request("依頼"),
      detail("これから直す。".repeat(60)),
      edit("src/a.ts"),
    ])

    expect(turns[0]?.steps[0]?.report).toBeUndefined()
  })

  it("見出し1行と長い段落だけの本文も、文字数の下限で中間レポートになる", () => {
    const markdown = `## 調べた結果\n\n${"この段落は行数こそ伸びないが、まとまった分量のある資料である。".repeat(8)}`
    const turns = mainViewTurns([request("依頼"), detail(markdown), edit("src/a.ts")])

    const step = turns[0]?.steps[0]
    expect(step?.report).toBe(markdown)
    expect(step?.interim).toBe(true)
  })

  it("中間レポートは1つのやり取りに何件でも積む（最後の1つに絞らない）", () => {
    const first = "## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"
    const second = "## 直した箇所\n\n- src/a.ts\n- src/b.ts"
    const turns = mainViewTurns([
      request("依頼"),
      detail(first),
      edit("src/a.ts"),
      detail(second),
      edit("src/b.ts"),
      detail("できたよ"),
    ])

    expect((turns[0]?.steps ?? []).map((step) => step.report)).toEqual([first, second, "できたよ"])
    expect((turns[0]?.steps ?? []).map((step) => step.interim)).toEqual([true, true, false])
  })

  it("ツール呼び出しが続いた本文は落とし、最後に書いた本文だけを残す", () => {
    const turns = mainViewTurns([
      request("依頼"),
      detail("まず読むね"),
      edit("src/a.ts"),
      detail("次に直すね"),
      edit("src/b.ts"),
      detail("直した結果はこう"),
    ])

    expect((turns[0]?.steps ?? []).map((step) => step.report)).toEqual([
      undefined,
      undefined,
      "直した結果はこう",
    ])
  })

  it("ツールを1つも呼ばないターンでは何も落ちない", () => {
    const turns = mainViewTurns([request("依頼"), detail("文章だけで答える")])

    expect(turns[0]?.steps[0]?.report).toBe("文章だけで答える")
  })

  it("質問はツールに数えないので、質問の直前に書いた本文は残る", () => {
    const turns = mainViewTurns([
      request("依頼"),
      detail("比べた結果はこう"),
      question("どれにする？"),
    ])

    const steps = turns[0]?.steps ?? []
    expect(steps[0]?.report).toBe("比べた結果はこう")
    expect(steps[0]?.actions).toHaveLength(1)
    // 質問の直前の本文は「レポート本体」であって、中間レポートにはしない。
    expect(steps[0]?.interim).toBe(false)
  })

  it("落とすのは本文だけで、続いた出来事はステップに残る", () => {
    const turns = mainViewTurns([request("依頼"), detail("まず直すね"), edit("src/a.ts")])

    const steps = turns[0]?.steps ?? []
    expect(steps).toHaveLength(1)
    expect(steps[0]?.report).toBeUndefined()
    expect(steps[0]?.actions).toHaveLength(1)
  })

  it("最初の依頼より前の記録も、request 無しのターンとして残す", () => {
    const turns = mainViewTurns([detail("依頼より前のレポート"), request("依頼"), detail("今回")])

    expect(turns).toHaveLength(2)
    expect(turns[0]?.request).toBeUndefined()
    expect(turns[0]?.steps[0]?.report).toBe("依頼より前のレポート")
  })
})

describe("mainViewTurns（追い越された中間レポートを畳む印。T-161）", () => {
  it("後ろにレポートを持つステップがあれば superseded が立つ", () => {
    const first = "## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"
    const turns = mainViewTurns([
      request("依頼"),
      detail(first),
      edit("src/a.ts"),
      detail("できたよ"),
    ])

    const steps = turns[0]?.steps ?? []
    expect(steps.map((step) => step.interim)).toEqual([true, false])
    expect(steps.map((step) => step.superseded)).toEqual([true, false])
  })

  it("いちばん後ろの中間レポート（まだ追い越されていない）には superseded が立たない", () => {
    const turns = mainViewTurns([
      request("依頼"),
      detail("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
      edit("src/a.ts"),
    ])

    expect(turns[0]?.steps[0]?.interim).toBe(true)
    expect(turns[0]?.steps[0]?.superseded).toBe(false)
  })

  it("<summary> に出す文字列は先頭行から作られる（見出しなら記号を落としてその語）", () => {
    const turns = mainViewTurns([
      request("依頼"),
      detail("## 調べた結果\n\n- 1つ目の発見\n- 2つ目の発見"),
      edit("src/a.ts"),
      detail("できたよ"),
    ])

    expect(turns[0]?.steps[0]?.firstLine).toBe("調べた結果")
  })

  it("見出しでない先頭行は記号を落とさずそのまま使う", () => {
    const turns = mainViewTurns([
      request("依頼"),
      detail("| 場所 | 状態 |\n| --- | --- |\n| src/a.ts | 直す |\n| src/b.ts | 直す |"),
      edit("src/a.ts"),
      detail("できたよ"),
    ])

    expect(turns[0]?.steps[0]?.firstLine).toBe("| 場所 | 状態 |")
  })

  it("先頭行が長いときは省略記号で切る", () => {
    const longHeading = `## ${"とても長い見出し".repeat(10)}`
    const turns = mainViewTurns([
      request("依頼"),
      detail(`${longHeading}\n\n- 1つ目の発見\n- 2つ目の発見`),
      edit("src/a.ts"),
      detail("できたよ"),
    ])

    const firstLine = turns[0]?.steps[0]?.firstLine ?? ""
    expect(firstLine.endsWith("…")).toBe(true)
    expect(firstLine.length).toBeLessThan(longHeading.length)
  })

  it("report を持たないステップの firstLine は undefined", () => {
    const turns = mainViewTurns([request("依頼"), edit("src/first.ts"), detail("あとから説明")])

    expect(turns[0]?.steps[0]?.report).toBeUndefined()
    expect(turns[0]?.steps[0]?.firstLine).toBeUndefined()
  })
})

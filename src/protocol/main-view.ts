// メインビューに出す前段の「決める」ロジック。**`MainViewEntry`（`session-state.ts`）を、
// やり取り（ターン）ごとにまとめる**純粋関数だけを置く。
//
// `groupIntoTurns` / `limitTurnEntries` はもとは1つのファイルにまとまっていた（移行の段6で
// HTML の組み立てが `src/ui/main-view/` へ移るのに合わせ、判断そのものはサーバ・ブラウザ
// どちらでも同じ結果になる `protocol` へ残した。docs/design.md 12章 段6）。
//
// `node:` にも `document` にも触らない（他の protocol と同じ制約）。

import { type MainViewEntry } from "./session-state.ts"

/**
 * 出すやり取りの数。もとは5だったが、2026-09-10 にユーザーの指定
 * （「2つ前までで良さそう」）で3へ下げた。2026-09-14 の指示で5へ戻した。
 */
export const MAX_MAIN_VIEW_TURNS = 5

// 1つのやり取りの中で出す記録の上限。超えた分は**古いほうから**落とし、件数だけを残す
// （やり取りの境界を優先する。ユーザーの決定 2026-09-10）。
const MAX_MAIN_VIEW_ENTRIES = 40

export type MainViewToolRun = Extract<MainViewEntry, { readonly kind: "tool" }>
export type MainViewQuestion = Extract<MainViewEntry, { readonly kind: "question" }>

/** ステップの中で起きたこと。ツールの実行か、キャラクターからの質問。 */
export type MainViewAction = MainViewToolRun | MainViewQuestion

/**
 * 1ステップ＝レポート1件と、それに続く出来事（ユーザーの決定 2026-09-10）。
 *
 * `interim` は、その本文が**中間レポート**（あとにツールが続いたが、まとまった資料なので
 * 残した本文。`keepOnlyInterimReports`）かどうか。`report` が undefined のときは常に false。
 * 見分けを付けて描くのは `src/ui/main-view/turn.tsx` の仕事で、判定はここに置く。
 *
 * `superseded` は、**自分より後ろに `report` を持つステップがあるか**（`markSupersededSteps`）。
 * 中間レポートが何件も積むと見通しが悪い問題（2026-09-16 の指摘）に対する材料で、
 * `interim && superseded` のときだけ `turn.tsx` が畳んで描く。`report` を持たないステップでも
 * 立つが、畳むかどうかの判定に使うのは中間レポートだけ。
 *
 * `firstLine` は `report` の先頭行（`report` が undefined なら undefined）。畳んだときの
 * `<summary>` に出す（`extractFirstLine`）。
 */
export type MainViewStep = {
  readonly report: string | undefined
  readonly interim: boolean
  readonly superseded: boolean
  readonly firstLine: string | undefined
  readonly actions: readonly MainViewAction[]
}

/**
 * 利用者の依頼1件と、それ以降のステップ。`request` が undefined なのは、最初の依頼より前の記録
 * （セッションの途中から追い始めたときに起こる）。`id` は**追加されても番号がずれない**ように
 * 先頭から数えた通し番号で、タブの選択を保つのに使う（`src/ui/main-view/main-view.tsx`）。
 */
export type MainViewTurn = {
  readonly id: number
  readonly request: string | undefined
  readonly steps: readonly MainViewStep[]
  /** 上限を超えて落とした記録の件数。0 のときは何も落としていない。 */
  readonly droppedCount: number
}

/**
 * 時系列の記録を、やり取り（ターン）ごとにまとめ、直近 {@link MAX_MAIN_VIEW_TURNS} 件へ絞る。
 * **昇順（古い→新しい）で返す**（並べ替え・タブのラベル付けは呼び出し側 `src/ui/main-view/` の仕事）。
 */
export function mainViewTurns(entries: readonly MainViewEntry[]): readonly MainViewTurn[] {
  return groupIntoTurns(entries)
    .slice(-MAX_MAIN_VIEW_TURNS)
    .map((turn) => keepOnlyInterimReports(turn))
    .map((turn) => markSupersededSteps(turn))
    .map((turn) => limitTurnEntries(turn))
}

/** 時系列に積まれた記録を、利用者の依頼を境目にしてやり取りごとへまとめる。 */
function groupIntoTurns(entries: readonly MainViewEntry[]): readonly MainViewTurn[] {
  const turns: MainViewTurn[] = []
  let current: { id: number; request: string | undefined; steps: MainViewStep[] } | undefined =
    undefined

  const flush = () => {
    if (current !== undefined) {
      turns.push({ ...current, droppedCount: 0 })
    }
  }

  for (const entry of entries) {
    if (entry.kind === "request") {
      flush()
      current = { id: turns.length, request: entry.text, steps: [] }
      continue
    }

    current ??= { id: 0, request: undefined, steps: [] }
    if (entry.kind === "detail") {
      current.steps.push({
        report: entry.markdown,
        interim: false,
        superseded: false,
        firstLine: undefined,
        actions: [],
      })
      continue
    }

    const step = current.steps.at(-1)
    // レポートより前に起きたことは、レポートを持たないステップにまとめる。
    current.steps =
      step === undefined
        ? [
            {
              report: undefined,
              interim: false,
              superseded: false,
              firstLine: undefined,
              actions: [entry],
            },
          ]
        : [...current.steps.slice(0, -1), { ...step, actions: [...step.actions, entry] }]
  }
  flush()

  return turns
}

/**
 * **あとにツール呼び出しが続いた本文のうち、実況だけを落とす**（`docs/requirements.md` 4.2。
 * 2026-09-16 決定）。「まず読むね」「次はテスト」のような実況は、ツールを呼ぶ合図としてしか
 * 書かれておらず、レポートとして読むものではない。**規約の条項（`src/core/report-notation.ts` の
 * 「前置きと締めを書かない」）では抑えきれなかった**ので、tsukumo の側で落とす
 * （4.2「なぜテキストの規約をやめたか」と同じ立場）。
 *
 * **まとまった資料（{@link isInterimReport}）は中間レポートとして残す**（同日にユーザーの指摘
 * 「枠組みされたまとまった資料がたまに出てくる」で、判定の材料を「ツールが続いたか」だけから
 * 「ツールが続いた**かつ**まとまっていない」の2条件へ狭めた）。
 *
 * **質問（`question`）はツールに数えない。** 質問は利用者が答える手前で止まる場所なので、
 * その直前に書いた本文は読むためのレポートとして残す（中間レポートにもしない）。
 *
 * **ツールを1つも呼ばないターンでは何も落ちない**（どのステップにも `tool` が続かない）。
 * 書きかけ（`partialUtterance`）は常に最後のステップなので、流れている間は消えない
 * （ツールが始まった時点で落ちるか、中間レポートに変わる。「出してから消す」＝ 2026-09-16 決定）。
 */
function keepOnlyInterimReports(turn: MainViewTurn): MainViewTurn {
  return {
    ...turn,
    steps: turn.steps.map((step) => {
      if (step.report === undefined || !step.actions.some((action) => action.kind === "tool")) {
        return step
      }
      return isInterimReport(step.report)
        ? { ...step, interim: true }
        : { ...step, report: undefined }
    }),
  }
}

/**
 * まとまった資料の印。**行頭に現れるブロックの記法だけ**を見る（見出し・表の行・箇条書き・
 * 番号付き・コードフェンス・引用・行頭の HTML タグ）。インラインの記法（`` `code` `` や
 * `**強調**`）を印にしないのは、実況もふつうにファイル名を `` ` `` で囲んで書くため。
 */
const STRUCTURE_MARK = /^\s*(?:#{1,6}\s|\||[-*+]\s|\d+[.)]\s|```|~~~|>|<[a-zA-Z/])/

/**
 * 中間レポートと認める下限。印が1つ付いただけの1〜2行（「- まず読むね」）は資料ではないので、
 * **行数か文字数のどちらか**を満たすことも求める。文字数のほうは、見出し1行＋長い段落のように
 * 行数が伸びない資料を拾うためにある。
 */
const MIN_INTERIM_REPORT_LINES = 3
const MIN_INTERIM_REPORT_LENGTH = 200

/**
 * 「まとまった資料」か（＝中間レポートとして残すか）。**構造の印を持ち、かつ短くない**ものだけを
 * 資料と見なす。**迷ったら落とす側に倒してある**（印が無ければ長くても落とし、印があっても
 * 短ければ落とす）: 実況が残るとチラつきの指摘がそのまま戻るのに対し、これまでは同じ本文を
 * すべて落としていたので、残す側を絞っても以前より悪くはならない。
 */
function isInterimReport(markdown: string): boolean {
  const lines = markdown.split("\n").filter((line) => line.trim() !== "")
  return (
    lines.some((line) => STRUCTURE_MARK.test(line)) &&
    (lines.length >= MIN_INTERIM_REPORT_LINES ||
      markdown.trim().length >= MIN_INTERIM_REPORT_LENGTH)
  )
}

/**
 * 各ステップに「自分より後ろに `report` を持つステップがあるか」（`superseded`）と、
 * `report` の先頭行（`firstLine`）を立てる。**`interim` の判定そのもの（`keepOnlyInterimReports`）
 * は変えない**——このタスク（2026-09-16）で足すのは「畳むかどうか」の材料だけ。
 * `interim` かどうかを問わず全ステップに立てるのは、位置関係だけで決まる値なので
 * 中間レポート限定にする理由が無いため（畳むかどうかの判定側で `interim` と組み合わせる。
 * `src/ui/main-view/turn.tsx`）。
 */
function markSupersededSteps(turn: MainViewTurn): MainViewTurn {
  const { steps } = turn.steps.reduceRight<{
    steps: readonly MainViewStep[]
    followedByReport: boolean
  }>(
    (acc, step) => ({
      steps: [
        {
          ...step,
          superseded: acc.followedByReport,
          firstLine: step.report === undefined ? undefined : extractFirstLine(step.report),
        },
        ...acc.steps,
      ],
      followedByReport: acc.followedByReport || step.report !== undefined,
    }),
    { steps: [], followedByReport: false },
  )
  return { ...turn, steps }
}

// 畳んだ `<summary>` に出す先頭行の長さの上限。「中間レポート」のラベルと並べる短い添え書きなので、
// `summarizeToolInput` の1行要約（120字）より短く抑える。
const MAX_STEP_SUMMARY_LENGTH = 40

/**
 * 本文の先頭行。空行は読み飛ばす。**見出し（`# `〜`###### `）ならマークを落としてその語だけ**を
 * 返す（複数畳まれたときに「## 調べた結果」ではなく「調べた結果」の方が読みやすいため）。
 * 見出し以外の行（表・箇条書き・引用・行頭の HTML タグなど）は**マークを落とさずそのまま**返す
 * ——「見出しならその語」以上の踏み込みはせず、迷ったところは変えない側に倒す。
 */
function extractFirstLine(markdown: string): string {
  const line = markdown
    .split("\n")
    .map((raw) => raw.trim())
    .find((trimmed) => trimmed !== "")
  if (line === undefined) {
    return ""
  }

  const heading = /^#{1,6}\s+(.*)$/.exec(line)
  const text = heading?.[1] === undefined ? line : heading[1].trim()
  return text.length <= MAX_STEP_SUMMARY_LENGTH
    ? text
    : `${text.slice(0, MAX_STEP_SUMMARY_LENGTH)}…`
}

/** 1つのやり取りが持つ記録を上限まで切り詰める。落とすのは**古いほう**（今回の続きを残す）。 */
function limitTurnEntries(turn: MainViewTurn): MainViewTurn {
  const counts = turn.steps.map((step) => (step.report === undefined ? 0 : 1) + step.actions.length)
  const total = counts.reduce((sum, count) => sum + count, 0)
  if (total <= MAX_MAIN_VIEW_ENTRIES) {
    return turn
  }

  const kept: MainViewStep[] = []
  let remaining = MAX_MAIN_VIEW_ENTRIES
  for (const [index, step] of [...turn.steps].reverse().entries()) {
    const count = counts[counts.length - 1 - index] ?? 0
    if (count > remaining) {
      break
    }
    kept.unshift(step)
    remaining -= count
  }

  return { ...turn, steps: kept, droppedCount: total - (MAX_MAIN_VIEW_ENTRIES - remaining) }
}

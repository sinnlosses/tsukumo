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

/** 1ステップ＝レポート1件と、それに続く出来事（ユーザーの決定 2026-09-10）。 */
export type MainViewStep = {
  readonly report: string | undefined
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
    .map((turn) => dropNarration(turn))
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
      current.steps.push({ report: entry.markdown, actions: [] })
      continue
    }

    const step = current.steps.at(-1)
    // レポートより前に起きたことは、レポートを持たないステップにまとめる。
    current.steps =
      step === undefined
        ? [{ report: undefined, actions: [entry] }]
        : [...current.steps.slice(0, -1), { ...step, actions: [...step.actions, entry] }]
  }
  flush()

  return turns
}

/**
 * **あとにツール呼び出しが続いた本文を落とす**（`docs/requirements.md` 4.2。2026-09-16 決定）。
 * 「まず読むね」「次はテスト」のような実況は、ツールを呼ぶ合図としてしか書かれておらず、
 * レポートとして読むものではない。**規約の条項（`src/core/report-notation.ts` の
 * 「前置きと締めを書かない」）では抑えきれなかった**ので、ツールを呼んだという事実で落とす
 * （4.2「なぜテキストの規約をやめたか」と同じ立場）。
 *
 * **質問（`question`）はツールに数えない。** 質問は利用者が答える手前で止まる場所なので、
 * その直前に書いた本文は読むためのレポートとして残す。
 *
 * **ツールを1つも呼ばないターンでは何も落ちない**（どのステップにも `tool` が続かない）。
 * 書きかけ（`partialUtterance`）は常に最後のステップなので、流れている間は消えない
 * （ツールが始まった時点で落ちる。「出してから消す」＝ 2026-09-16 決定）。
 */
function dropNarration(turn: MainViewTurn): MainViewTurn {
  return {
    ...turn,
    steps: turn.steps.map((step) =>
      step.actions.some((action) => action.kind === "tool") ? { ...step, report: undefined } : step,
    ),
  }
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

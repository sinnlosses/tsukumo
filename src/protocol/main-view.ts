// メインビューに出す前段の「決める」ロジック。**`MainViewEntry`（`session-state.ts`）を、
// やり取り（ターン）ごとにまとめ、1件ずつのツールを表示してよい範囲まで絞る**純粋関数だけを置く。
//
// もとは `src/presentation/view.ts` の `groupIntoTurns` / `limitTurnEntries` / `toolVisibility`
// だった（移行の段6で HTML の組み立てが `src/ui/main-view/` へ移るのに合わせ、判断そのものは
// サーバ・ブラウザどちらでも同じ結果になる `protocol` へ残した。docs/design.md 12章 段6）。
//
// `node:` にも `document` にも触らない（他の protocol と同じ制約）。

import { type MainViewEntry } from "./session-state.ts"

/** 出すやり取りの数（今回・1つ前・2つ前）。ユーザーの指定（2026-09-10「2つ前までで良さそう」）。 */
export const MAX_MAIN_VIEW_TURNS = 3

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

/**
 * ツール名ごとに `input` の中のファイルパスが入るフィールド名。ここに載っている名前だけを
 * 「ファイルを変えた操作」として扱う（`docs/requirements.md` 4.2）。**未知のツール名はここに
 * 無いので、`toolVisibility` で自動的に「見せない」側に倒れる**（安全側のデフォルト）。
 */
const FILE_PATH_FIELD_BY_TOOL: Readonly<Record<string, string>> = {
  Write: "file_path",
  Edit: "file_path",
  NotebookEdit: "notebook_path",
}

/** サブエージェントを起動するツールの名前。`input.description` がタスク名（会話内容ではない）。 */
const SUBAGENT_LAUNCH_TOOL_NAME = "Agent"

export type ToolVisibility =
  | { readonly kind: "hidden" }
  | { readonly kind: "file-change"; readonly path: string | undefined }
  | { readonly kind: "agent-launch"; readonly description: string | undefined }

/**
 * 1件のツール実行を、メインビューに出してよい範囲で分類する（`docs/requirements.md` 4.2 の
 * 決定を実装したもの）。**判定は「ファイルを変えた操作 → サブエージェントの起動 →
 * それ以外は見せない」だけで、成否は見ない。**
 *
 * **失敗したツールもここでは特別扱いしない**（2026-09-15 決定）。以前は `result.isError` を
 * 最優先で見て引数と出力をレポートへそのまま出していたが、それだと `Bash` が非0で終わるだけで
 * コマンドと stdout/stderr がレポートに流れ込む。失敗に気づく経路と中身を読む経路は
 * サイドバーの「いま何をしているか」が持つ（`src/ui/sidebar/activity.tsx`）。
 *
 * **未知のツール名（`FILE_PATH_FIELD_BY_TOOL` にも `SUBAGENT_LAUNCH_TOOL_NAME` にも無い名前）は
 * `hidden` に落ちる。** 新しいツールが増えても、ここに追記するまでは安全側（見せない）に倒れる。
 */
export function toolVisibility(entry: MainViewToolRun): ToolVisibility {
  const filePathField = FILE_PATH_FIELD_BY_TOOL[entry.name]
  if (filePathField !== undefined) {
    return { kind: "file-change", path: stringField(entry.input, filePathField) }
  }

  if (entry.name === SUBAGENT_LAUNCH_TOOL_NAME) {
    return { kind: "agent-launch", description: stringField(entry.input, "description") }
  }

  return { kind: "hidden" }
}

/** `input`（`unknown`。transcript から来た JSON 値）から、指定したフィールドの文字列値を取り出す。 */
function stringField(input: unknown, field: string): string | undefined {
  if (!isRecord(input)) {
    return undefined
  }

  const value = input[field]
  return typeof value === "string" ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

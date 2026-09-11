// いま出すべき表情・衣装を決める。「決める」層。純粋関数で、fs/process には触らない。
//
// 表情は本筋として `speak(text, expression)` の引数から決まる（キャラ自身が選ぶ。
// docs/requirements.md「4.3 状態連動」2026-09-11 決定）。ツールを実行している間だけ、
// 自動で「作業中」に切り替える。切り替えの起点（ツール開始からの経過時間）は呼び出し側から
// 渡される現在時刻で判定する（`Date.now()` はここでは呼ばない。副作用は呼び出し側
// （src/index.ts の配線層）に残す）。
//
// モデル名と衣装の対応は、キャラクター定義ファイルの形式がまだ決まっていないため
// （docs/requirements.md「7. 未決事項」）、当面ここに置く。形式が決まったら定義ファイル側へ移す
// （docs/architecture.md 原則4「キャラクターの中身をコードに書かない」）。

export type Expression = "default" | "working" | "proud" | "flustered"
export type Outfit = "default" | "light" | "normal" | "heavy"

/**
 * 表情名の全体。**`default` が先頭**で、キャラクター定義に立ち絵があるものだけを選ぶときの
 * 元になる（src/character.ts の `availableExpressions`）。
 */
export const EXPRESSIONS: readonly Expression[] = ["default", "working", "proud", "flustered"]

/**
 * ツールが動き始めてから、これだけの時間が経ってもまだ終わっていなければ表情を「作業中」に
 * 切り替える。ツールが連続して短く走るときに working ⇄ speak の表情が短時間で往復しない
 * ようにするための遅延（docs/requirements.md「4.3 状態連動」）。
 */
export const WORKING_EXPRESSION_DELAY_MS = 1000

/** 表情を決めるのに要る、実行中のツール1件分。開始時刻だけを見る。 */
export type RunningToolTiming = {
  readonly startedAt: number
}

/**
 * いま出す表情を決める。**優先順位**（docs/requirements.md「4.3 状態連動」）:
 * 実行中のツールが1つでも {@link WORKING_EXPRESSION_DELAY_MS} 以上前から動いていれば
 * `working`。それ以外は `speechExpression`（直近の `speak` の表情）をそのまま返す。
 * `speak` がまだ1回も呼ばれていないときの `default` へのフォールバックは、呼び出し側
 * （src/session-view.ts の `INITIAL_SESSION_VIEW.speechExpression`）が持つ。
 */
export function resolveExpression(
  runningTools: readonly RunningToolTiming[],
  speechExpression: Expression,
  now: number,
): Expression {
  const isWorking = runningTools.some((tool) => now - tool.startedAt >= WORKING_EXPRESSION_DELAY_MS)
  return isWorking ? "working" : speechExpression
}

/**
 * モデル名から衣装を決める。`haiku` = 軽装 / `sonnet` = 通常装備 / `opus` = 戦闘配置
 * （docs/requirements.md「4.3 状態連動」、`~/.claude/output-styles/asuna.md` のモデル分岐と対応）。
 *
 * 渡ってくる `model` が短い別名（"opus" など）か解決済みの完全なモデルIDかは場合による
 * （SDK の `init` は完全なモデルIDを返す）ため、部分一致で両方を拾う。
 */
export function resolveOutfit(model: string | undefined): Outfit {
  if (model === undefined) {
    return "default"
  }

  const lowerModel = model.toLowerCase()
  const matched = OUTFIT_BY_MODEL_SUBSTRING.find(([needle]) => lowerModel.includes(needle))
  return matched?.[1] ?? "default"
}

/**
 * 表情の日本語ラベル。立ち絵の alt / aria-label に使う
 * （画像だけでは伝わらない状態を、スクリーンリーダー等に文字で残すため）。
 */
export function expressionLabel(expression: Expression): string {
  return EXPRESSION_LABEL[expression]
}

const OUTFIT_BY_MODEL_SUBSTRING: readonly (readonly [needle: string, outfit: Outfit])[] = [
  ["haiku", "light"],
  ["sonnet", "normal"],
  ["opus", "heavy"],
]

const EXPRESSION_LABEL: Readonly<Record<Expression, string>> = {
  default: "通常",
  working: "作業中",
  proud: "どや顔",
  flustered: "あわあわ",
}

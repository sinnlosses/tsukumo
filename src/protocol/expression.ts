// いま出すべき表情・衣装を決める。「決める」層。純粋関数で、fs/process には触らない。
//
// 表情は本筋として `speak(text, expression)` の引数から決まる（キャラ自身が選ぶ。
// docs/requirements.md「4.3 状態連動」2026-09-11 決定）。ツールを実行している間だけ、
// 自動で「作業中」に切り替える。切り替えの起点（ツール開始からの経過時間）は呼び出し側から
// 渡される現在時刻で判定する（`Date.now()` はここでは呼ばない。副作用は呼び出し側
// （src/cli.ts の配線層）に残す）。
//
// **表情の日本語ラベルはここに持たない。** キャラクターごとの言葉なので定義ファイル側
// （`character.json` の `expressions`）にあり、解くのは src/protocol/character.ts
// （docs/architecture.md 原則4「キャラクターの中身をコードに書かない」、docs/design.md 7章）。
// モデル名と衣装の対応だけは、どのキャラクターでも同じ「装備の重さ」の規則なのでここに残す。

export type Expression = "default" | "working" | "proud" | "flustered"
export type Outfit = "default" | "light" | "normal" | "heavy"

/**
 * 表情名の全体。**`default` が先頭**で、キャラクター定義に立ち絵があるものだけを選ぶときの
 * 元になる（src/protocol/character.ts の `availableExpressions`）。
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
 * （src/protocol/session-state.ts の `INITIAL_SESSION_STATE.speechExpression`）が持つ。
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
 * 実行中のツールのうち、まだ「作業中」の遅延を超えていないものがあれば、超えるまでの
 * 残り時間（ミリ秒）を返す。超えているものしかない・実行中のツールが無いときは undefined
 * （その場合は時間経過だけで表情が変わることはない）。
 *
 * ツールの開始・終了だけでは、遅延が経過した「その瞬間」には何のイベントも来ないので、
 * 何もしなければ次のイベントが来るまで表情の再計算が起きない。呼び出し側
 * （`src/ui/character-view/character-view.tsx` の `useEffect` タイマー）が、この関数の
 * 戻り値ぶん先に1回だけ自分を配り直す形で「作業中」への切り替えを進める（移行前は
 * `usecase/event-sink.ts` がサーバ側でこれを担っていたが、キャラビューが React の部品に
 * なった段5でブラウザ側へ移した。docs/design.md 4.1）。
 */
export function nextWorkingTransitionDelayMs(
  runningTools: readonly RunningToolTiming[],
  now: number,
): number | undefined {
  const remaining = runningTools
    .map((tool) => tool.startedAt + WORKING_EXPRESSION_DELAY_MS - now)
    .filter((ms) => ms > 0)
  return remaining.length === 0 ? undefined : Math.min(...remaining)
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

const OUTFIT_BY_MODEL_SUBSTRING: readonly (readonly [needle: string, outfit: Outfit])[] = [
  ["haiku", "light"],
  ["sonnet", "normal"],
  ["opus", "heavy"],
]

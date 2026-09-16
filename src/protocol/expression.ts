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
 * **立ち絵が必ず要る表情**（`characters/README.md`）。`default` は表情の指定が無いときの
 * 落とし先、`working` はツールの実行中に自動で切り替える先で、**どちらもコードが名前で直接
 * 参照する**ので「あるものだけ」で済ませられない。画面からこの2つを消せないのは同じ理由
 * （消せる表情は {@link REMOVABLE_EXPRESSIONS} のほうだけ）。
 */
export const REQUIRED_EXPRESSIONS = ["default", "working"] as const

export type RequiredExpression = (typeof REQUIRED_EXPRESSIONS)[number]

/** 画面から立ち絵を**消せる**表情（必須の2つを除いた残り）。 */
export type RemovableExpression = Exclude<Expression, RequiredExpression>

export const REMOVABLE_EXPRESSIONS: readonly RemovableExpression[] =
  EXPRESSIONS.filter(isRemovableExpression)

/** 衣装の全体。並びは画面に出す順（軽いほうから重いほうへ）。 */
export const OUTFITS: readonly Outfit[] = ["default", "light", "normal", "heavy"]

/** 外から届いた文字列が表情の名前かどうかを検証する（境界で1回だけ使う）。 */
export function isExpression(value: string): value is Expression {
  return EXPRESSIONS.some((expression) => expression === value)
}

/** 外から届いた文字列が、立ち絵を消せる表情の名前かどうかを検証する。 */
export function isRemovableExpression(value: string): value is RemovableExpression {
  return isExpression(value) && !REQUIRED_EXPRESSIONS.some((required) => required === value)
}

/** 外から届いた文字列が衣装の名前かどうかを検証する。 */
export function isOutfit(value: string): value is Outfit {
  return OUTFITS.some((outfit) => outfit === value)
}

/**
 * ツールが動き始めてから、これだけの時間が経ってもまだ終わっていなければ表情を「作業中」に
 * 切り替える。ツールが連続して短く走るときに working ⇄ speak の表情が短時間で往復しない
 * ようにするための遅延（docs/requirements.md「4.3 状態連動」）。
 */
export const WORKING_EXPRESSION_DELAY_MS = 1000

/**
 * ツールが終わってからも、これだけの時間は「作業中」を保つ（クールダウン。2026-09-16
 * ユーザー選択、`docs/requirements.md`「4.3 状態連動」）。**ツールとツールの隙間**で
 * working ⇄ speak が往復するのを防ぐための猶予で、{@link WORKING_EXPRESSION_DELAY_MS}
 * とは別の値（ツール1回あたりの実行時間ではなく、次のツールが始まるまでの隙間の長さに
 * 合わせて決める値のため）。**クールダウン中に新しい `speak` が来ても、明けるまでは
 * `working` のまま**にする（クールダウン中は `speechExpression` を無視する。2026-09-16
 * ユーザーが2回言い直して確認した決定）。
 *
 * **クールダウン中に始まったツールは、`WORKING_EXPRESSION_DELAY_MS` の遅延を待たず
 * 即座に「作業中」を出す**（{@link isToolImmediatelyWorking}）。この扱いが無いと、
 * クールダウンが明けてから次のツールが遅延の1000msに達するまでの間にもう一度
 * `speechExpression` へ戻ってしまい、**クールダウンの長さを「隙間 + 1000ms」まで
 * 見積もらないといけなくなる**。即座に働く扱いにしたことで、クールダウンは
 * **実際の隙間の長さだけ**を覆えばよい。
 *
 * 値は T-167 の実装セッション自身でのツール呼び出しの隙間を実測して決めた: 短い探索を
 * 連続して挟んだときの隙間が約2.1秒・3.2秒、まとまった判断を挟んだ隙間が約19.6秒・
 * 20.2秒。後者は本当に手が止まっている場面なので `speechExpression` に戻ってよく、
 * 覆う対象は前者（短い隙間で連続する場面）だけでよい。**その最大値（3.2秒）にサンプル数の
 * 少なさ（2件）を踏まえた余裕を足して**4000msにした。
 */
export const WORKING_EXPRESSION_COOLDOWN_MS = 4000

/** 表情を決めるのに要る、実行中のツール1件分。開始時刻だけを見る。 */
export type RunningToolTiming = {
  readonly startedAt: number
}

/**
 * ツールがクールダウン中に始まったか（{@link WORKING_EXPRESSION_DELAY_MS} の遅延を待たず
 * 即座に「作業中」を出してよいか）。直近にツールが終わっていて、かつそのツールが
 * {@link WORKING_EXPRESSION_COOLDOWN_MS} 以内に始まっていれば true。
 */
function isToolImmediatelyWorking(
  tool: RunningToolTiming,
  lastToolFinishedAt: number | undefined,
): boolean {
  return (
    lastToolFinishedAt !== undefined &&
    tool.startedAt >= lastToolFinishedAt &&
    tool.startedAt - lastToolFinishedAt < WORKING_EXPRESSION_COOLDOWN_MS
  )
}

/**
 * いま出す表情を決める。**優先順位**（docs/requirements.md「4.3 状態連動」）:
 * 1. 実行中のツールが1つでもクールダウン中に始まっている、または開始から
 *    {@link WORKING_EXPRESSION_DELAY_MS} 以上経っていれば `working`
 *    （{@link isToolImmediatelyWorking}）
 * 2. そうでなくても、直近にツールが終わった時刻（`lastToolFinishedAt`）から
 *    {@link WORKING_EXPRESSION_COOLDOWN_MS} 以内なら `working`（クールダウン。**この間は
 *    `speechExpression` を無視する**。新しい `speak` が来ても、クールダウンが明けるまでは
 *    従わない）
 * 3. どちらでもなければ `speechExpression`（直近の `speak` の表情）をそのまま返す
 *
 * `speak` がまだ1回も呼ばれていないときの `default` へのフォールバックは、呼び出し側
 * （src/protocol/session-state.ts の `INITIAL_SESSION_STATE.speechExpression`）が持つ。
 */
export function resolveExpression(
  runningTools: readonly RunningToolTiming[],
  speechExpression: Expression,
  lastToolFinishedAt: number | undefined,
  now: number,
): Expression {
  const isWorking =
    runningTools.some(
      (tool) =>
        isToolImmediatelyWorking(tool, lastToolFinishedAt) ||
        now - tool.startedAt >= WORKING_EXPRESSION_DELAY_MS,
    ) ||
    (lastToolFinishedAt !== undefined && now - lastToolFinishedAt < WORKING_EXPRESSION_COOLDOWN_MS)
  return isWorking ? "working" : speechExpression
}

/**
 * 表情が次に変わりうる時刻までの残り時間（ミリ秒）を返す。次の2つのうち、いちばん早く
 * 来るものを見る:
 * - 実行中のツール（クールダウン中に始まったものを除く）が「作業中」の遅延
 *   （{@link WORKING_EXPRESSION_DELAY_MS}）を超える瞬間
 * - クールダウン（{@link WORKING_EXPRESSION_COOLDOWN_MS}）が明ける瞬間
 *
 * どちらも過ぎている・そもそも無いときは undefined（その場合は時間経過だけで表情が
 * 変わることはない）。**クールダウン中に始まったツールは遅延を待たず最初から `working`**
 * なので、そのツール自身の遅延超えは再計算のきっかけにならない（{@link resolveExpression}）。
 *
 * ツールの開始・終了だけでは、遅延やクールダウンが経過した「その瞬間」には何のイベントも
 * 来ないので、何もしなければ次のイベントが来るまで表情の再計算が起きない。呼び出し側
 * （`src/ui/character-view/character-view.tsx` の `useEffect` タイマー）が、この関数の
 * 戻り値ぶん先に1回だけ自分を配り直し、**発火するたびに次の遅延を計算し直して立て直す**
 * ことで、「作業中」への切り替えとクールダウン明けの両方を追う（移行前は
 * `usecase/event-sink.ts` がサーバ側でこれを担っていたが、キャラビューが React の部品に
 * なった段5でブラウザ側へ移した。docs/design.md 4.1）。
 */
export function nextWorkingTransitionDelayMs(
  runningTools: readonly RunningToolTiming[],
  lastToolFinishedAt: number | undefined,
  now: number,
): number | undefined {
  const remaining = [
    ...runningTools
      .filter((tool) => !isToolImmediatelyWorking(tool, lastToolFinishedAt))
      .map((tool) => tool.startedAt + WORKING_EXPRESSION_DELAY_MS - now),
    lastToolFinishedAt === undefined
      ? undefined
      : lastToolFinishedAt + WORKING_EXPRESSION_COOLDOWN_MS - now,
  ].filter((ms): ms is number => ms !== undefined && ms > 0)
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

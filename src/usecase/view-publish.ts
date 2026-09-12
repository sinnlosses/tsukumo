// ビューを配る係を作る。「決める → 描く → 配る」1回分をまるごと包む唯一の場所。
//
// 実際に描く・配る手段（HTML の組み立て・ファイルからの読み取り・SSE への push）は
// **呼び出し側（src/index.ts）が用意した関数として受け取る**（presentation・infrastructure を
// ここから import しないため。原則3。決定: createViewPublisher は usecase に置く）。
// ここが持つのは、呼び出しの順序と「ここでの失敗は次の更新に任せて諦める」という契約だけ
// （docs/coding-standards.md「エラーハンドリング」— 描画ループの中に try/catch を散らさない）。

import { resolveOutfit, type Expression, type Outfit } from "../domain/expression.ts"
import { type TaskSummaryItem } from "../domain/task-summary.ts"
import {
  currentExpression,
  mainViewEntries,
  type MainViewEntry,
  type SessionView,
  type ToolActivity,
} from "./session-view.ts"

/**
 * キャラビューに渡す立ち絵ソース。`src/presentation/view.ts` の `CharacterPortraitSource` /
 * `src/infrastructure/character-asset.ts` の同名の型と同じ形だが、**presentation・infrastructure を
 * import しない**（原則3）。
 */
type CharacterAssetsLike = {
  readonly portrait:
    | { readonly kind: "svg"; readonly svgMarkup: string }
    | { readonly kind: "image"; readonly dataUri: string }
    | undefined
  readonly outfitAccent: string | undefined
  readonly altText: string
}

/** キャラビューの本文を組み立てるために渡す値（`speeches` を足した形）。 */
type CharacterViewDataLike = CharacterAssetsLike & { readonly speeches: readonly string[] }

/**
 * ビューを配るために呼び出し側が用意する手段。**描く・配ることそのものはここが決めない**
 * （どう HTML にするかは presentation、どう配るかは infrastructure の仕事）。
 */
export type ViewRendering = {
  /** キャラクター定義・立ち絵をファイルから読む（`src/infrastructure/character-asset.ts`）。 */
  readonly readCharacterAssets: (expression: Expression, outfit: Outfit) => CharacterAssetsLike
  readonly buildCharacterBody: (data: CharacterViewDataLike) => string
  readonly buildMainBody: (entries: readonly MainViewEntry[]) => string
  readonly buildSidebarBody: (data: ReturnType<typeof sidebarData>) => string
  /** 組み立てた本文を、開いているブラウザへ push する（`src/infrastructure/view-server.ts` の `publish`）。 */
  readonly publish: (view: "main" | "character" | "sidebar", body: string) => void
}

/**
 * ビューを配る係を作る。
 *
 * `readTaskSummary` は develop/tasks.json の読み直し係（`src/infrastructure/task-summary.ts` の
 * `createTaskSummaryReader`）。`now` は現在時刻を返す関数（呼び出し側が `Date.now` を渡す。
 * 表情の判定 {@link currentExpression} にだけ使う）。`onFailure` はここでの失敗を諦めて次へ
 * 進むための通知で、**受け取った例外の中身は渡さない**（会話内容が紛れた例外を外へ出さないため。
 * docs/coding-standards.md「会話内容の扱い」）。
 */
export function createViewPublisher(
  render: ViewRendering,
  readTaskSummary: () => readonly TaskSummaryItem[] | undefined,
  now: () => number,
  onFailure: () => void,
): (view: SessionView) => void {
  return (view) => {
    try {
      const data: CharacterViewDataLike = {
        speeches: view.speeches,
        ...render.readCharacterAssets(currentExpression(view, now()), resolveOutfit(view.model)),
      }
      render.publish("character", render.buildCharacterBody(data))
      render.publish("main", render.buildMainBody(mainViewEntries(view)))
      render.publish("sidebar", render.buildSidebarBody(sidebarData(view, readTaskSummary())))
    } catch {
      onFailure()
    }
  }
}

/**
 * サイドバーに出す値。**いま何をしているかは実行中・直近の完了のツール名＋入力**
 * （要約は表示側 `src/presentation/view.ts` の仕事。引数の断片が要約に入りうることは
 * `docs/coding-standards.md`「会話内容の扱い」に沿って承知した上で渡す）。**経過時間はここに
 * 無い**（入力欄側へ渡すのは `publishTurnStatus`。2026-09-12 T-075 決定）。
 */
function sidebarData(view: SessionView, tasks: readonly TaskSummaryItem[] | undefined) {
  return {
    activity: {
      running: view.runningTools.map(toSidebarToolActivity),
      finished: view.finishedTools.map(toSidebarToolActivity),
    },
    tasks,
    session: {
      model: view.model,
      permissionMode: view.permissionMode,
    },
  }
}

function toSidebarToolActivity(activity: ToolActivity) {
  return { name: activity.name, input: activity.input, nested: activity.nested }
}

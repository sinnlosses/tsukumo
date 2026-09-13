// ビューを配る係を作る。「決める → 描く → 配る」1回分をまるごと包む唯一の場所。
//
// 実際に描く・配る手段（HTML の組み立て・ファイルからの読み取り・SSE への push）は
// **呼び出し側（src/index.ts）が用意した関数として受け取る**（presentation・infrastructure を
// ここから import しないため。原則3。決定: createViewPublisher は usecase に置く）。
// ここが持つのは、呼び出しの順序と「ここでの失敗は次の更新に任せて諦める」という契約だけ
// （docs/coding-standards.md「エラーハンドリング」— 描画ループの中に try/catch を散らさない）。

import { resolveOutfit, type Expression, type Outfit } from "../protocol/expression.ts"
import {
  currentExpression,
  mainViewEntries,
  type MainViewEntry,
  type SessionState,
} from "../protocol/session-state.ts"

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
  /** 組み立てた本文を、開いているブラウザへ push する（`src/infrastructure/view-server.ts` の `publish`）。 */
  readonly publish: (view: "main" | "character", body: string) => void
}

/**
 * ビューを配る係を作る。**サイドバーはここでは配らない**（段3 で React の部品へ移った。
 * `src/ui/sidebar/` が WebSocket の `SessionState` から直接組み立てる。docs/design.md 12章）。
 *
 * `now` は現在時刻を返す関数（呼び出し側が `Date.now` を渡す。表情の判定
 * {@link currentExpression} にだけ使う）。`onFailure` はここでの失敗を諦めて次へ進むための通知で、
 * **受け取った例外の中身は渡さない**（会話内容が紛れた例外を外へ出さないため。
 * docs/coding-standards.md「会話内容の扱い」）。
 */
export function createViewPublisher(
  render: ViewRendering,
  now: () => number,
  onFailure: () => void,
): (view: SessionState) => void {
  return (view) => {
    try {
      const data: CharacterViewDataLike = {
        speeches: view.speeches,
        ...render.readCharacterAssets(currentExpression(view, now()), resolveOutfit(view.model)),
      }
      render.publish("character", render.buildCharacterBody(data))
      render.publish("main", render.buildMainBody(mainViewEntries(view)))
    } catch {
      onFailure()
    }
  }
}

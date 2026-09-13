// ビューを配る係を作る。「決める → 描く → 配る」1回分をまるごと包む唯一の場所。
//
// 実際に描く・配る手段（HTML の組み立て・SSE への push）は**呼び出し側（src/index.ts）が
// 用意した関数として受け取る**（presentation・infrastructure をここから import しないため。
// 原則3。決定: createViewPublisher は usecase に置く）。ここが持つのは、呼び出しの順序と
// 「ここでの失敗は次の更新に任せて諦める」という契約だけ（docs/coding-standards.md
// 「エラーハンドリング」— 描画ループの中に try/catch を散らさない）。

import {
  mainViewEntries,
  type MainViewEntry,
  type SessionState,
} from "../protocol/session-state.ts"

/**
 * ビューを配るために呼び出し側が用意する手段。**描く・配ることそのものはここが決めない**
 * （どう HTML にするかは presentation、どう配るかは infrastructure の仕事）。
 */
export type ViewRendering = {
  readonly buildMainBody: (entries: readonly MainViewEntry[]) => string
  /** 組み立てた本文を、開いているブラウザへ push する（`src/infrastructure/view-server.ts` の `publish`）。 */
  readonly publish: (view: "main", body: string) => void
}

/**
 * ビューを配る係を作る。**サイドバーは段3、キャラビューは段5でここでは配らなくなった**
 * （それぞれ React の部品が WebSocket の `SessionState` から直接組み立てる。
 * `src/ui/sidebar/` / `src/ui/character-view/`。docs/design.md 12章）。ここに残るのは
 * まだ移っていないメインビューだけ。
 *
 * `onFailure` はここでの失敗を諦めて次へ進むための通知で、**受け取った例外の中身は渡さない**
 * （会話内容が紛れた例外を外へ出さないため。docs/coding-standards.md「会話内容の扱い」）。
 */
export function createViewPublisher(
  render: ViewRendering,
  onFailure: () => void,
): (view: SessionState) => void {
  return (view) => {
    try {
      render.publish("main", render.buildMainBody(mainViewEntries(view)))
    } catch {
      onFailure()
    }
  }
}

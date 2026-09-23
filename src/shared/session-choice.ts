// 切り替え先として選べるセッション1件（`docs/requirements.md` 4.8「鍵」）。**サーバとブラウザの
// 両方が読む契約**なので shared に置く。
//
// **中身は印から読めるものだけ**（目印・セッションのID・最終更新時刻）。会話の内容は一切
// 入らない（`docs/coding-standards.md`「会話内容の扱い」）ので、画面に出せるのは
// 「どの起動の、いつまでの作業か」までで、何を話したかは切り替えて組み直すまで分からない。

/**
 * 画面に並べる切り替え先の上限。**同じディレクトリで作業を続けるほど印の付いたセッションは
 * 際限なく増える**（実測: このリポジトリで120件）ので、新しいほうから切って渡す。
 *
 * 10 なのは、`<select>` を開いたときに一覧が画面に収まる長さだから。**これより古いものへは
 * 画面から戻れない**が、切り替えたいのは「いま並行して動かしている別の tsukumo」か
 * 「ついさっきまでの作業」なので、この線で足りる。
 */
export const MAX_SESSION_CHOICES = 10

/**
 * 切り替え先のセッション1件。組み立てるのは `src/server/core/session-restore.ts` の
 * `listMarkedSessions`（claude 自身の transcript の一覧から、印を読んで作る）。
 */
export type SessionChoice = {
  /**
   * 目印（印を付けた tsukumo のビューのポート番号）。**一覧はいまの部屋（このビューのポート）の
   * ものだけ**なので、並ぶ行はすべて同じ値になる（`src/server/core/session-restore.ts` の
   * `listMarkedSessions`）。昔の印（目印の無いもの・1文字の `A` / `B` …）はポートへ戻してある
   * （`src/server/core/config.ts` の `readSessionMark`）。**行が複数あるのは、落ちた tsukumo の
   * 印といま動いている tsukumo の印が見分けられないため**で、見分けるのは
   * {@link SessionChoice.lastModified} の側。
   */
  readonly viewPort: number
  /** claude 側のセッションのID（続きから始めるときに `resume` へ渡す値）。 */
  readonly sessionId: string
  /** transcript の最終更新時刻（エポックミリ秒）。**新しい順**に並んで届く。 */
  readonly lastModified: number
}

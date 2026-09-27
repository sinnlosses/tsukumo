// 切り替え先として選べるセッション1件（`docs/requirements.md` 4.8「鍵」）。サーバとブラウザの
// 両方が読む契約なので shared に置く。
//
// 中身は SDK の一覧から読めるものだけ（目印・セッションのID・最終更新時刻・始まった時刻・
// 見出し）。transcript を読まないと出せないもの（依頼の数・要約）は `SessionDigest` の側。`heading` は会話の内容そのものではなく、SDK 自身が作った表示用の
// 題（`customTitle` → 自動要約 → 最初の依頼、の順に決まる。`src/server/session-driver/adapter/sdk-session.ts`）
// で、`127.0.0.1` のページに出すだけ（ログ・ファイル・外部へは出さない。
// `docs/coding-standards.md`「会話内容の扱い」。メインビューが会話を出すのと同じ扱いで、
// 複製にはあたらない）。

/**
 * 画面に並べる切り替え先の上限。同じディレクトリで作業を続けるほど印の付いたセッションは
 * 際限なく増える（実測: このリポジトリで120件）ので、新しいほうから切って渡す。
 *
 * 10 なのは、切り替え画面の一覧が転がさずに収まる長さだから。これより古いものへは
 * 画面から戻れないが、切り替えたいのは「いま並行して動かしている別の tsukumo」か
 * 「ついさっきまでの作業」なので、この線で足りる。
 */
export const MAX_SESSION_CHOICES = 10

/**
 * tsukumo が題を付けるとき（`decideSessionTitle`）に切り詰める文字数。
 * モデルに指示する長さ（`REPORT_TITLE_DESCRIPTION`）も同じ値を指す。
 */
export const MAX_SESSION_HEADING_LENGTH = 24

/**
 * 画面から選び直せるセッションのIDの上限。UUID を通せる素朴な上限であって、形の検査では
 * ない（知らないIDは起こす側が新規に倒すので、ここで形まで縛らない）。
 */
export const MAX_SESSION_ID_LENGTH = 200

/**
 * 切り替え先のセッション1件。組み立てるのは `src/server/session-driver/core/session-restore.ts` の
 * `listMarkedSessions`（claude 自身の transcript の一覧から、印を読んで作る）。
 */
export type SessionChoice = {
  /**
   * 目印（印を付けた tsukumo のビューのポート番号）。一覧はいまの部屋のものだけなので、
   * 並ぶ行はすべて同じ値になる（絞り込みと、行が複数ある理由は `src/server/session-driver/core/session-restore.ts`
   * の `listMarkedSessions`）。昔の印（目印の無いもの・1文字の `A` / `B` …）はポートへ戻してある
   * （`src/server/session-driver/core/session-restore.ts` の `readSessionMark`）。見分けるのは
   * {@link SessionChoice.lastModified} の側。
   */
  readonly viewPort: number
  /** claude 側のセッションのID（続きから始めるときに `resume` へ渡す値）。 */
  readonly sessionId: string
  /** transcript の最終更新時刻（エポックミリ秒）。新しい順に並んで届く。 */
  readonly lastModified: number
  /**
   * 始まった時刻（エポックミリ秒。SDK の `createdAt`＝transcript の最初の行の時刻）。
   * SDK が出さなかったときは {@link SessionChoice.lastModified} に畳む（境界の `taggedSession`）。
   */
  readonly startedAt: number
  /**
   * 行の見出し（SDK の `summary`。`customTitle` → 自動要約 → 最初の依頼、の順に決まる）。
   * 外来の値なので境界（`session-restore.ts` の `taggedSession`）で検証し、文字列でない・空なら
   * 無いものとして畳む。無いときの見え方は切り替え画面（`SessionSwitcher`）が決める。
   */
  readonly heading: string | undefined
}

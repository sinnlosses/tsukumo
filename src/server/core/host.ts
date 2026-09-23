// ホスト（ターミナル環境）に依存する操作をまとめたポート。
//
// ここに書けるのは「ホストに何をしてほしいか」だけで、**特定のホストの語彙を入れてはいけない**
// （docs/architecture.md「ホスト依存の操作は1つのポートにまとめる」）。実装は src/server/adapter/orca-host.ts。
//
// **失敗を例外にしない。** ホストのコマンドが無い環境ではその操作を諦めて動作を続けるのが
// 要件（docs/display.md 4.2「フォールバック」）なので、成否を戻り値で返す。
//
// **操作は「ビューを見せる」1つだけ。** 画面も入力もブラウザのページ側で完結するので、
// ホストに頼るのは「そのページをどこかに出す」ところに絞ってある。箱を替えるときに
// 差し替えるのもここ1つ（docs/research/app-shell.md）。

/** ホストへの依頼の結果。失敗しても呼び出し側は続行できる。 */
export type HostResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export type Host = {
  /**
   * URL のビューを見えている状態にする。まだ無ければ開き、既にあればその内容を最新にする。
   * 開くのと更新するのを1つにしてあるのは、呼び出し側が「今どちらの状態か」を持たずに
   * 済ませるため（同じ URL で何度呼んでもビューは1つ）。
   */
  readonly showView: (url: string) => Promise<HostResult>
}

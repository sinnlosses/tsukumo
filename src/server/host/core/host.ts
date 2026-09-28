// ホスト（ターミナル環境）に依存する操作をまとめたポート。
//
// ここに書けるのは「ホストに何をしてほしいか」だけで、特定のホストの語彙を入れてはいけない（`docs/architecture/adr/0015-single-host-port.md`）。
//
// 失敗を例外にしない。ホストのコマンドが無い環境ではその操作を諦めて動作を続けるので、成否を戻り値で返す。
//
// 操作は「ビューを見せる」と「ファイルを開く」の2つだけ。
// 画面も入力もブラウザのページ側で完結するので、ホストに頼るのは「そのページをどこかに出す」と「レポートに書かれたファイルをホストのエディタで開く」に絞ってある。

/** ホストへの依頼の結果。失敗しても呼び出し側は続行できる。 */
export type HostResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export type Host = {
  /**
   * URL のビューを見えている状態にする。まだ無ければ開き、既にあればその内容を最新にする。
   * 同じ URL で何度呼んでもビューは1つ。
   */
  readonly showView: (url: string) => Promise<HostResult>
  /**
   * ファイルを1つ、ホストのエディタで開く。`path` は cwd 相対。
   * 任意の文字列を通してよいかどうかは判断しないので、呼び出し側が git 管理下にあるかを確かめてから渡す（`openTrackedFile`）。
   * 行番号は渡さない（いまのホストに口が無い）。
   */
  readonly openFile: (path: string) => Promise<HostResult>
}

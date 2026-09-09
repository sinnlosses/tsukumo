// ホスト（ターミナル環境）に依存する操作をまとめたポート。
//
// ここに書けるのは「ホストに何をしてほしいか」だけで、**特定のホストの語彙を入れてはいけない**
// （docs/architecture.md「ホスト依存の操作は1つのポートにまとめる」）。実装は src/orca-host.ts。
//
// **失敗を例外にしない。** ホストのコマンドが無い環境ではその操作を諦めて動作を続けるのが
// 要件（docs/requirements.md 4.2「フォールバック」）なので、成否を戻り値で返す。

/** ホストへの依頼の結果。失敗しても呼び出し側は続行できる。 */
export type HostResult = { readonly ok: true } | { readonly ok: false; readonly reason: string }

/** 新しいペインを、今のペインのどちら側に作るか。 */
export type PanePlacement = "beside" | "below"

export type PaneRequest = {
  readonly placement: PanePlacement
  /** 新しいペインで起動するコマンド。何も起動しないときは undefined。 */
  readonly command: string | undefined
}

export type Host = {
  /** ペインを分割し、新しいペインでコマンドを起動する。 */
  readonly openPane: (request: PaneRequest) => Promise<HostResult>
  /**
   * URL のビューを見えている状態にする。まだ無ければ開き、既にあればその内容を最新にする。
   * 開くのと更新するのを1つにしてあるのは、呼び出し側が「今どちらの状態か」を持たずに
   * 済ませるため（同じ URL で何度呼んでもビューは1つ）。
   */
  readonly showView: (url: string) => Promise<HostResult>
}

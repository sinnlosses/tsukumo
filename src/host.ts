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

/** 送信先として選べる、生きているペイン1つの情報。 */
export type Pane = {
  readonly id: string
  /** 一覧から選ぶときに人が読む名前。 */
  readonly label: string
  /**
   * 「claude が動いていそう」という手がかり。**確実な判定ではない**ので、これを理由に
   * 一覧から外してはいけない（絞り込みには使わない）。並び順を claude らしいものへ
   * 寄せる・見た目で軽く示す、という用途だけに使う（判定の中身は src/orca-host.ts）。
   */
  readonly likelyClaude: boolean
}

/** ペインの一覧を得る依頼の結果。 */
export type ListPanesResult =
  | { readonly ok: true; readonly panes: readonly Pane[] }
  | { readonly ok: false; readonly reason: string }

export type Host = {
  /** ペインを分割し、新しいペインでコマンドを起動する。 */
  readonly openPane: (request: PaneRequest) => Promise<HostResult>
  /**
   * URL のビューを見えている状態にする。まだ無ければ開き、既にあればその内容を最新にする。
   * 開くのと更新するのを1つにしてあるのは、呼び出し側が「今どちらの状態か」を持たずに
   * 済ませるため（同じ URL で何度呼んでもビューは1つ）。
   */
  readonly showView: (url: string) => Promise<HostResult>
  /** 送信先として選べる、生きているペインの一覧を得る。 */
  readonly listPanes: () => Promise<ListPanesResult>
  /** 指定したペインに文字を送る（依頼の送信）。 */
  readonly sendText: (paneId: string, text: string) => Promise<HostResult>
}

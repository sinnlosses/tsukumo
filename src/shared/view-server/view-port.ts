// ビューを配るポート番号の語彙。
// 複数の機能が同じ値を読むので、機能の外のここに置く。

// ビューを配る既定のポート。
// 固定にしてあるのは、開き直したブラウザタブが同じ URL のまま使えるように（docs/architecture/adr/0017-serve-from-local-http.md）。
export const DEFAULT_VIEW_PORT = 7327

// ポート番号として読める上限（下限は `0` ＝ OS が空きを選ぶ）。
// セッションの印の目印もポート番号なので、読み取りの範囲は `Config` と共通にする。
export const MAX_PORT_NUMBER = 65535

// ビューを配るポート番号の語彙。
// 複数の機能が同じ値を読むので、機能の外のここに置く。

// ビューを配る既定のポート。
// 固定にしてあるのは、開き直したブラウザタブが同じ URL のまま使えるように（docs/architecture/adr/0017-serve-from-local-http.md）。
export const DEFAULT_VIEW_PORT = 7327

// ポート番号として読める上限（下限は `0` ＝ OS が空きを選ぶ）。
// セッションの印の目印もポート番号なので、読み取りの範囲は `Config` と共通にする。
export const MAX_PORT_NUMBER = 65535

/**
 * 環境変数から読んだビューのポートの読み取り結果。既定を使ったか、明示的に渡されたかをここで区別する（既定のときだけポートをずらすため）。
 * `0`（OS が空きを選ぶ）も明示指定として扱い、ずらす対象にしない。
 */
export type ViewPortResolution =
  | { readonly kind: "invalid" }
  | { readonly kind: "default"; readonly port: number }
  | { readonly kind: "explicit"; readonly port: number }

/** ポートをずらす対象になりうる読み取り結果（`invalid` を除いたもの）。 */
export type ResolvedViewPort = Exclude<ViewPortResolution, { readonly kind: "invalid" }>

/**
 * 環境変数のポート番号を読む。
 * 未設定・空文字は「既定を使う」、整数として読めない・範囲外の値は `invalid`、それ以外（`0` を含む）は「明示的に渡された」として扱う。
 *
 * 「既定を使う」ときの起点は既定で {@link DEFAULT_VIEW_PORT} だが、`defaultPort` で差し替えられる（{@link resolveViewPortFallbackBase}）。
 * `TSUKUMO_VIEW_PORT` を明示したとき＝`explicit` の結果には効かない。起点をずらす対象は「既定のときだけずらす」既定の帯そのものだから。
 */
export function resolveViewPort(
  rawPort?: string,
  defaultPort: number = DEFAULT_VIEW_PORT,
): ViewPortResolution {
  const trimmed = rawPort?.trim()
  if (trimmed === undefined || trimmed === "") {
    return { kind: "default", port: defaultPort }
  }

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_PORT_NUMBER) {
    return { kind: "invalid" }
  }

  return { kind: "explicit", port: parsed }
}

/**
 * `TSUKUMO_VIEW_PORT_FALLBACK_BASE` の生の値を、既定ポートの起点として読む。
 * 読めない・未設定な値は {@link DEFAULT_VIEW_PORT} に倒し、起動を止めない（既定の帯そのものを差し替えるだけの小さな上書きのため）。
 */
export function resolveViewPortFallbackBase(raw?: string): number {
  const resolved = resolveViewPort(raw)
  return resolved.kind === "explicit" ? resolved.port : DEFAULT_VIEW_PORT
}

// ビューサーバの待ち受けポートを決める。環境変数から読んだ値が既定か明示かの区別と、
// **既定を使ったときだけ** EADDRINUSE で次の番号へずらすリトライを1つの概念としてここに閉じる
// （docs/coding-standards.md「環境変数の読み取りを1モジュールに集約」）。
//
// listen そのもの（node:http）は src/infrastructure/view-server.ts の責務のまま。ここは「どのポートで
// 試すか」の決定と、その決定に沿って `start` を呼び直すことだけを持つ。

// ビューを配る既定のポート。固定にしてあるのは、開き直したブラウザタブが同じ URL のまま
// 使えるように（docs/architecture.md「HTML はローカルの HTTP サーバから配る」）。
export const DEFAULT_VIEW_PORT = 7327

// 既定ポートから数えて何個先まで試すか（7327〜7346 の20個）。複数の tsukumo を手元で並べて
// 動かす程度を想定した目安で、無限には伸ばさない
// （どのポートで待っているか分からない状態を作らないため、上限を持って諦める）。
export const VIEW_PORT_FALLBACK_ATTEMPTS = 20

/**
 * 環境変数から読んだビューのポートの読み取り結果。**既定を使ったか、明示的に渡されたかを
 * ここで区別する**（既定のときだけポートをずらすため。`0`（OS が空きを選ぶ）も明示指定として
 * 扱い、ずらす対象にしない）。
 */
export type ViewPortResolution =
  | { readonly kind: "invalid" }
  | { readonly kind: "default"; readonly port: number }
  | { readonly kind: "explicit"; readonly port: number }

/** ポートをずらす対象になりうる読み取り結果（`invalid` を除いたもの）。 */
export type ResolvedViewPort = Exclude<ViewPortResolution, { readonly kind: "invalid" }>

/**
 * 環境変数のポート番号を読む。未設定・空文字は「既定を使う」、整数として読めない・範囲外の値は
 * `invalid`、それ以外（`0` を含む）は「明示的に渡された」として扱う。
 */
export function resolveViewPort(rawPort: string | undefined): ViewPortResolution {
  const trimmed = rawPort?.trim()
  if (trimmed === undefined || trimmed === "") {
    return { kind: "default", port: DEFAULT_VIEW_PORT }
  }

  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    return { kind: "invalid" }
  }

  return { kind: "explicit", port: parsed }
}

/** `start` が失敗したときの結果。成功時は呼び出し元の型 `T` をそのまま持つ。 */
export type ViewPortStartResult<T> =
  | { readonly ok: true; readonly server: T; readonly port: number }
  | { readonly ok: false; readonly reason: string }

/**
 * 決めたポートで `start` を呼ぶ。**明示指定は一度だけ試してそのまま結果を返す**
 * （ユーザーの指示——指定したポートで待てないことに気づけなくなるため、ずらさない）。
 * **既定のときだけ**、EADDRINUSE が続く限り `VIEW_PORT_FALLBACK_ATTEMPTS` 回まで +1 して試す。
 * EADDRINUSE 以外の失敗（EACCES など）はその場で確定させ、ずらさない
 * （`docs/coding-standards.md`のエラーハンドリング方針どおり、種類で分ける）。
 *
 * 全滅したときは、試した範囲（最初と最後のポート番号）を含む理由を返す
 * （黙って0番＝空きポート自動割り当てへは逃げない）。
 */
export async function startOnResolvedPort<T>(
  resolution: ResolvedViewPort,
  start: (port: number) => Promise<T>,
): Promise<ViewPortStartResult<T>> {
  if (resolution.kind === "explicit") {
    try {
      return { ok: true, server: await start(resolution.port), port: resolution.port }
    } catch (error) {
      return { ok: false, reason: describeStartError(error) }
    }
  }

  const firstPort = resolution.port
  const lastPort = firstPort + VIEW_PORT_FALLBACK_ATTEMPTS - 1
  for (let port = firstPort; port <= lastPort; port++) {
    try {
      return { ok: true, server: await start(port), port }
    } catch (error) {
      if (!isEaddrInUseError(error)) {
        return { ok: false, reason: describeStartError(error) }
      }
      // EADDRINUSE のときだけ次のポートへ。ループの続きへ進む。
    }
  }

  return {
    ok: false,
    reason: `${String(firstPort)}〜${String(lastPort)} のポートがすべて塞がっている`,
  }
}

// listen の失敗を種類で分ける。Node の listen エラーは Error に `code` が生えた形で届くので、
// `in` で存在を確かめてから読む（キャストで型を迂回しない。docs/coding-standards.md）。
function isEaddrInUseError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EADDRINUSE"
}

function describeStartError(error: unknown): string {
  return error instanceof Error ? error.message : "原因不明"
}

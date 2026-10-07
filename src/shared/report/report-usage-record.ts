// `report` の塊の使われ方の記録の行の形。1行 = 描いた `report` 1回。
// 書いてよいのは時刻・セッションID・塊と記法の名前・数だけで、塊の中身・逃げ道の文字は入れない。

/** 行の形の版。形を変えたら上げ、古い行と見分ける。 */
export const REPORT_USAGE_FORMAT_VERSION = 3 satisfies number

export type ReportUsageRecord = {
  readonly v: typeof REPORT_USAGE_FORMAT_VERSION
  /** ISO 8601（オフセット付き）。行だけで時刻が決まる。 */
  readonly at: string
  /** claude 側のセッションID。 */
  readonly sessionId: string
  /** その回に出た塊の種類（重複無し）。 */
  readonly blockKinds: readonly string[]
  /** その回に出た塊の欄（重複無し。版3から）。 */
  readonly blockFields: readonly string[]
  /** その回に逃げ道（`markdown` の塊）の外側に出た記法の種類（重複無し）。 */
  readonly notations: readonly string[]
  /** その回に逃げ道の HTML の容れ物の中に出た記法の種類（重複無し）。 */
  readonly containedNotations: readonly string[]
  /** その回に逃げ道に出た、塊の無い記法の種類（重複無し）。 */
  readonly escapeNotations: readonly string[]
  /** 知らない種類で境界で落とした塊の数。 */
  readonly unknownBlockCount: number
}

/**
 * 差し戻した `report` 1回の記録の行。受け付けの行と同じファイルに入り、`kind` の有無で見分ける（受け付けの行に `kind` は無い）。
 * 書いてよいのは時刻・セッションID・差し戻しの種類の名前だけ。
 */
export type ReportRejectionRecord = {
  readonly v: typeof REPORT_USAGE_FORMAT_VERSION
  readonly kind: "rejected"
  /** ISO 8601（オフセット付き）。 */
  readonly at: string
  readonly sessionId: string
  readonly reasons: readonly string[]
}

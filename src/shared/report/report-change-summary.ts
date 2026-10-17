// 最終レポートの目録の末尾に出す変更の札の形。数えるのは tsukumo で、モデルには書かせない。

/** 依頼の頭の HEAD から数えた変更の量。 */
export type ReportChangeCount = {
  readonly files: number
  readonly added: number
  readonly removed: number
}

/**
 * レポートが持つ変更の札。数えられなかった・まだ届いていない・復元した記録は `none`。
 * `none` と `counted` の 0 ファイルは別物（0 は数えた結果）。
 */
export type ReportChangeSummary =
  | { readonly kind: "none" }
  | ({ readonly kind: "counted" } & ReportChangeCount)

export const NO_REPORT_CHANGE_SUMMARY = { kind: "none" } as const satisfies ReportChangeSummary

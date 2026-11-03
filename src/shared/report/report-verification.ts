// 最終レポートの「確かめたこと」に出す、検証の段と件数の形。
// 値は検証の控え（作業ツリーの根の `.check-record.json`）から、木の SHA が合ったときだけ運ぶ。モデルには書かせない。

/** 段の成否。控えの `result` と同じ3つ。 */
export type VerificationStageResult = "passed" | "carried" | "failed"

/** 段で通ったテストの数。数えない段（型検査など）は `none`。 */
export type VerificationCount =
  | { readonly kind: "counted"; readonly tests: number }
  | { readonly kind: "none" }

/** 検証の段1つ。`name` は控えの機械の名前で、表示名への置き換えは画面が決める。 */
export type VerificationStage = {
  readonly name: string
  readonly result: VerificationStageResult
  readonly count: VerificationCount
}

/**
 * レポートが持つ検証の段。控えが無い・読めない・木が合わない・まだ届いていない・復元した記録は `none`。
 */
export type ReportVerification =
  | { readonly kind: "none" }
  | { readonly kind: "checked"; readonly stages: readonly VerificationStage[] }

export const NO_REPORT_VERIFICATION = { kind: "none" } as const satisfies ReportVerification

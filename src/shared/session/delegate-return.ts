// `phase_result` の結果を委譲の返却の形にしたもの。書式の正典は `docs/architecture/workflow-contract/skill-sequence.md`「スキルの契約」。
// 会話の内容が通るのでログに出さない。

/**
 * 返却が申告した段の位置。
 * `step` は `work_plan` の `phases` の段の id、`numbered` は委譲先のフェーズの範囲の中の番号と範囲の段の数（互換の欄）、`unplaced` はどちらも無い。
 */
export type PhasePosition =
  | { readonly kind: "step"; readonly step: string }
  | { readonly kind: "numbered"; readonly phase: number; readonly count: number }
  | { readonly kind: "unplaced" }

/**
 * 委譲先が `phase_result` で返した結果。
 * `phase-done` は `finished`、`phase-skipped` は `skipped`、`stopped` は `stopped`。
 */
export type DelegateReturn =
  | {
      readonly kind: "phase-done"
      readonly position: PhasePosition
      readonly summary: string
    }
  | { readonly kind: "phase-skipped"; readonly position: PhasePosition }
  | {
      readonly kind: "stopped"
      readonly position: PhasePosition
      readonly summary: string
    }

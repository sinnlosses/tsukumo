// `phase_result` の結果を委譲の返却の形にしたもの。書式の正典は `docs/architecture/workflow-contract.md`「スキルの契約」。
// 会話の内容が通るのでログに出さない。

/**
 * 委譲先が `phase_result` で返した結果。
 * `phase-done` は `finished`、`phase-skipped` は `skipped`、`stopped` は `stopped`。
 */
export type DelegateReturn =
  | {
      readonly kind: "phase-done"
      readonly phase: number
      readonly count: number
      readonly summary: string
    }
  | { readonly kind: "phase-skipped"; readonly phase: number; readonly count: number }
  | {
      readonly kind: "stopped"
      readonly phase: number
      readonly count: number
      readonly summary: string
    }

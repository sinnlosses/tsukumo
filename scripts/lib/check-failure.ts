// `pnpm run check` の重い段の結果から、落ちた段を名指しする行を組み立てる。

export type StageOutcome = { readonly name: string; readonly status: number }

/** 終了コードが 0 でない段ごとに、段の名前と終了コードの1行を、入力の順に返す。 */
export function describeFailedStages(outcomes: readonly StageOutcome[]): readonly string[] {
  return outcomes
    .filter((outcome) => outcome.status !== 0)
    .map((outcome) => `${outcome.name} が終了コード ${outcome.status} で落ちた`)
}

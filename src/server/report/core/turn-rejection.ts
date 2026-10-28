// 1ターンに1回だけ差し戻す関門の名前。

/** ターンの頭で空に戻る。段の閉じ方の3つの名前は `closing` の1つの枠を共有する。 */
export type TurnRejection =
  | "violation"
  | "resend"
  | "nothing-new"
  | "unanswered-work-plan"
  | "closing"
  | "finished-with-ng"
  | "background-running"
  | "a2ui-structure"

// レポートの本文に出さない「わかりにくい語」と、その言い換え先。用語集の表（docs/glossary/plain-word.md）はここから書き直す。

export type PlainWord = {
  readonly spelling: string
  readonly replacement: string
  readonly meaning: string
}

// 長い綴りを先に置く（「再演集」を「再演」より先に見つけ、同じ箇所を二重に数えない）。
export const PLAIN_WORDS = [
  {
    spelling: "再演集",
    replacement: "タスクの再試集",
    meaning: "送り出し済みのタスクを、前後で解かせ直すために凍結して保存したもの",
  },
  {
    spelling: "再演",
    replacement: "タスクの再試",
    meaning:
      "設定や文書を変える前後で、送り出し済みのタスクを本物の claude に解かせ直して結果を比べること",
  },
  {
    spelling: "有界な自律",
    replacement: "承認なし実行の上限",
    meaning:
      "新しい /loop の流れの最後の段階。人の承認なしで自動で動くが、回数と触れる範囲に上限があり、その中に収まる",
  },
] as const satisfies readonly PlainWord[]

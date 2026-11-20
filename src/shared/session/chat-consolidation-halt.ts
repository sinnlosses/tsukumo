// 雑談の記憶の整理が続けて失敗して止まったか。

export type ChatConsolidationHalt =
  | { readonly halted: false }
  | { readonly halted: true; readonly failures: number }

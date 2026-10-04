/** 確認がどう閉じたか。`sent` は文面を送ったあと、`dismissed` は送らずに閉じたあと（キャンセル・Esc・外側のクリック）。 */
export type TaskRunConfirmOutcome = "sent" | "dismissed"

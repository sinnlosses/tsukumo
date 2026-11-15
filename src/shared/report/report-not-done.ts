// 根の `Report.notDone`（やっていないこと）を、描く側へ渡す値にする。「無い」と言うこと（空の並び）と、省いたことを区別する。

export type ReportNotDoneView =
  | { readonly kind: "omitted" }
  | { readonly kind: "listed"; readonly items: readonly string[] }

export function reportNotDoneView(notDone?: readonly string[]): ReportNotDoneView {
  return notDone === undefined ? { kind: "omitted" } : { kind: "listed", items: notDone }
}

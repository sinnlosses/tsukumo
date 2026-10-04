// 作業ツリーの git 管理下のファイルの一覧（「エディタで開く」を押せるかの照らし先）。

/** 取り直している間は `checking`（押せるかをまだ決めない）。読めなかったときは空の `known`。 */
export type TrackedFileList =
  | { readonly kind: "checking" }
  | { readonly kind: "known"; readonly files: ReadonlySet<string> }

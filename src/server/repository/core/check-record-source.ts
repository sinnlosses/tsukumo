// 検証の控え（作業ディレクトリの根の `.check-record.json`）と、作業ツリーの木の SHA を読むための口の型。

/** 控えのファイルの本文。無い・読めないときは `unavailable`。 */
export type CheckRecordText =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "unavailable" }

/** いまの作業ツリーの中身の木の SHA。取れなければ `unknown`。 */
export type WorktreeTree =
  | { readonly kind: "known"; readonly sha: string }
  | { readonly kind: "unknown" }

/** 作業ディレクトリの控えと git に触る口。どれも例外を投げない。 */
export type CheckRecordSource = {
  readonly readRecordText: () => Promise<CheckRecordText>
  /** 未追跡のファイルを含み `.gitignore` の対象を含まない木。本物の index と objects には書かない。 */
  readonly readWorktreeTree: () => Promise<WorktreeTree>
}

/** 何も読まない口（疑似セッション用）。 */
export const IDLE_CHECK_RECORD_SOURCE: CheckRecordSource = {
  readRecordText: () => Promise.resolve({ kind: "unavailable" }),
  readWorktreeTree: () => Promise.resolve({ kind: "unknown" }),
}

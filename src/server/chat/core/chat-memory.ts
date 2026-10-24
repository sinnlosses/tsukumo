// 雑談の記憶の口の型。ここにあるのは型だけ。
// 覚えたことを書き換える口（`PersonaMemory`）とあらすじの写しの口（`ChatSummary`）と、その結果の種類。

/**
 * 覚えたことを人格に書き足す口と、覚えた1行を忘れる口。
 * どちらも結果の種類だけを返す。モデルへ返す固定文は `rememberReply` / `forgetReply` が決める。
 */
export type PersonaMemory = {
  readonly remember: (line: string) => PersonaRememberResult
  /**
   * 覚えた1行を忘れる（文面の完全一致で指す）。
   * 書き足しとは別に数えるので、同じターンで覚え直せる。
   */
  readonly forget: (line: string) => PersonaForgetResult
  /** ターンが終わった合図（次のターンでまた1行ずつ受け付ける）。 */
  readonly finishTurn: () => void
}

/**
 * `remember` の結果。
 * `turn-used` はそのターンで既に1行書いた、`unwritable-line` は空・改行入り・長すぎる行、
 * `duplicate` は節に同じ文面の行がある、`not-editable` は書けないパック、`failed` はディスクに書けなかった。
 */
export type PersonaRememberResult =
  | "written"
  | "turn-used"
  | "unwritable-line"
  | "duplicate"
  | "not-editable"
  | "failed"

/** `forget` の結果。`turn-used` はそのターンで既に1行消した、`no-match` は節に一致する行が無い。 */
export type PersonaForgetResult = "erased" | "turn-used" | "no-match" | "not-editable" | "failed"

/**
 * あらすじの写しの読み書き口。
 * 中身を読んで判定する口は持たない。
 * `systemPrompt` へ載せるかどうかの判断は `takeChatMemoryPromptParts` が持つ。
 */
export type ChatSummary = {
  /** 写しと印を読む（ファイルが無い・読めないときは undefined）。 */
  readonly read: () => ChatSummaryRecord | undefined
  /** 最近の話題の見出しを、新しい順のまま読む（写しがまだ無い・読めないときは空）。 */
  readonly readTopics: () => readonly string[]
  /** あらすじがアーカイブのどの行まで取り込んだか（写しが無い・印を持たない写しは `unknown`）。 */
  readonly readFold: () => ChatSummaryFold
  /**
   * 定着が書き直したあらすじの本文と、最近の話題の見出し（新しい順）と、取り込んだ最後の行の時刻を上書きする。
   * 印は変えない（ファイルが無ければ「未渡し」で書く）。
   * 書けたかどうかと、書くときに上限で落とした古い行の数を返す（例外は投げない）。
   * 定着はどのプロセスのどちらのモードのターンからも走り、畳んだ会話を文脈に持っているセッションが決まらないため。
   */
  readonly write: (
    summary: string,
    topics: readonly string[],
    foldedThrough: string,
  ) => ChatSummaryWriteResult
  /** 印を「未渡し」に戻す（`/clear` を見たとき）。 */
  readonly markUndelivered: () => void
  /** 印を「渡し済み」にする（読んで `systemPrompt` へ載せたとき）。 */
  readonly markDelivered: () => void
}

/** {@link ChatSummary.write} の結果。`droppedLines` は上限に収めるために落とした本文の行数（収まれば 0）。 */
export type ChatSummaryWriteResult =
  | { readonly kind: "failed" }
  | { readonly kind: "written"; readonly droppedLines: number }

/**
 * アーカイブのどの行まで畳んだか。
 * `none` はまだ1行も畳んでいない、`through` は `at`（アーカイブの行の時刻）の行まで畳んだ。
 */
export type ChatFoldPoint =
  | { readonly kind: "none" }
  | { readonly kind: "through"; readonly at: string }

/** あらすじが取り込んだところ。写しが無い・印を持たない写しは `unknown`。 */
export type ChatSummaryFold = ChatFoldPoint | { readonly kind: "unknown" }

/** {@link ChatSummary.read} が返す1件。`delivered` が渡し済みの印。 */
export type ChatSummaryRecord = {
  readonly summary: string
  readonly delivered: boolean
}

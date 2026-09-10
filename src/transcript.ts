// transcript(JSONL) を読み、最新の assistant 発話を取り出し、セリフと詳細に分ける。
// 加えて、サイドバー用にコンテキスト使用量とサブエージェントの保留件数も取り出す。「読む」層。
//
// JSONL の1行は外部由来（Claude Code が書き出すもの）なので構造を信用しない。
// unknown で受けて検証し、通った行だけを扱う。
// 壊れた行・未知の type を含む行は読み飛ばし、例外を投げない。

/**
 * transcript の全文から、最新の assistant 発話のテキストを取り出す。
 * assistant の発話が1つも無ければ undefined を返す。
 */
export function extractLatestUtterance(content: string): string | undefined {
  const utterances = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => parseAssistantUtterance(line))
    .filter((utterance): utterance is string => utterance !== undefined)

  return utterances.at(-1)
}

/**
 * transcript の**最新の** `type: "assistant"` 行から、コンテキスト使用量（トークン数の合計）を
 * 取り出す。`input_tokens + cache_read_input_tokens + cache_creation_input_tokens` の合計値
 * （サイドバー「コンテキスト使用量」の情報源。`docs/history/direction.md` 2026-09-09 決定事項）。
 *
 * **残量パーセントは出さない。** モデルの窓の大きさが transcript のどこにも無いため
 * （決定事項どおり、実数だけを返す）。
 *
 * assistant 行が1つも無い、最新の行に `usage` が無い・形が壊れているときは undefined を返す。
 * `extractLatestUtterance` と違い、テキストが無い行（tool_use のみの行など）も対象に含める
 * （assistant 行には基本的に毎回 `usage` が付くため、直前の発話行まで遡る必要が無い）。
 */
export function extractContextUsage(content: string): number | undefined {
  const latestAssistantLine = latestLineOfType(content, "assistant")
  return latestAssistantLine === undefined ? undefined : usageTotal(latestAssistantLine)
}

/**
 * transcript の `type: "system"` 行にある `pendingBackgroundAgentCount` の最新の値を取り出す。
 * この行は疎で、他の `system` 行には現れない（実測: 全 `system` 行のうち一部だけが持つ）。
 * **件数の権威ある情報源はこれ**（個々のサブエージェントの状況は `src/subagents.ts` が別途扱う）。
 * 1つも無ければ undefined を返す。
 */
export function extractLatestPendingBackgroundAgentCount(content: string): number | undefined {
  const values = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => pendingBackgroundAgentCountOf(tryParseJson(line)))
    .filter((value): value is number => value !== undefined)

  return values.at(-1)
}

/** メインビューに時系列で流す1件分の記録。ツールの実行か、発話の詳細のどちらか。 */
export type MainViewEntry =
  | {
      readonly kind: "tool"
      readonly name: string
      readonly input: unknown
      /** まだ結果が transcript に届いていない（作業中の）ツールは undefined になる。 */
      readonly result: { readonly content: string; readonly isError: boolean } | undefined
    }
  | { readonly kind: "detail"; readonly markdown: string }

/**
 * transcript から、メインビューに時系列で出す記録を取り出す。**メインビューには「作業中」と
 * 「完了後」の2つの状態があるが、transcript だけからは今どちらなのかを確実に判定できない**
 * （assistant の1メッセージ内で text と tool_use が混在する順序に規約上の保証が無いため）。
 * そこで状態を分けず、**ツールの実行と発話の詳細を出現順にそのまま積む**形にしている。
 * 結果として、直近の結果が届いていないツール（`result: undefined`）が末尾に並んでいれば
 * それが「作業中」に、末尾が `detail` エントリなら「完了後」に自然に対応する
 * （呼び出し側で状態を明示的に切り替える必要が無い）。
 *
 * - **ツール**: assistant 行の `content[]` にある `tool_use`（`name` / `input`）と、対応する
 *   `user` 行の `message.content[]` にある `tool_result`（`tool_use_id` で対応付け）を1件にする。
 *   `toolUseResult`（`user` 行のトップレベル）にもツールごとに形の違う結果が入っているが、
 *   `message.content[]` の `tool_result` は `content` / `is_error` に統一された形を持つため
 *   こちらを使う（2026-09-09、自セッションの transcript で両方の実在を確認）
 * - **詳細**: `text` を `splitUtterance` に通し、セリフを除いた `detail` だけを積む
 *   （`docs/requirements.md` 4.2「詳細はメインビュー側に回る」）。空になった `detail`
 *   （セリフだけの発話）は積まない
 * - **`thinking` は対象外**（`docs/requirements.md` 4.1「表示してよいのは type: "text" だけ」）
 */
export function extractMainViewEntries(
  content: string,
  speechMarker: string,
): readonly MainViewEntry[] {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => tryParseJson(line))

  const results = collectToolResults(lines)
  return lines.flatMap((line) => mainViewEntriesInLine(line, results, speechMarker))
}

export type UtteranceParts = {
  readonly speech: string | undefined
  readonly detail: string
}

/**
 * 1つの発話を「セリフ」と「詳細」に分ける（`docs/requirements.md` 4.2、正典は
 * `~/.claude/output-styles/asuna.md`「セリフと詳細の書き分け」）。**規約はセリフを行頭の
 * マーカー（`speechMarker`。既定は「アスナ: 」）で始めることだけを決めており、tsukumo は
 * それを機械的に拾う**。マーカーは呼び出し側から受け取る（環境変数の読み取りは
 * `src/index.ts` に集約している）。コードブロック（``` で囲まれた範囲）の中の
 * マーカー行は拾わない。
 *
 * - **マーカーは行頭での完全一致だけを見る。** 行の途中に同じ文字列があっても拾わない
 * - **規約に従っていない発話（セリフが1つも無い）**: `speech` は `undefined` を返す。
 *   直前のセリフを出し続けるかどうかは表示側の責務なので、ここでは決めない
 *   （`docs/requirements.md` 4.2「吹き出しは直前のセリフを出し続ける」）
 * - **セリフが複数箇所に分かれているとき**: 出現順にすべて連結する。**セリフは役割
 *   （掛け声・リアクション・完了報告など）で書き分けられるものなので、後のセリフが前のセリフを
 *   上書きする理由が無い**。連続するマーカー行は改行で、離れたまとまりは空行を挟んでつなぐ
 * - `detail` は発話からセリフ行を除いた残り。セリフが無ければ発話の全文がそのまま `detail`
 *   になる。引用（`> `）はセリフではないので、詳細の中の普通の引用としてそのまま残る
 */
export function splitUtterance(utterance: string, speechMarker: string): UtteranceParts {
  const classified = classifyLines(utterance.split("\n"), speechMarker)

  return {
    speech: extractSpeech(classified, speechMarker),
    detail: extractDetail(classified),
  }
}

/**
 * transcript の1行を assistant の発話テキストへ変換する。
 * JSON として不正、または assistant 以外（未知の type を含む）の行は undefined を返す。
 */
function parseAssistantUtterance(rawLine: string): string | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawLine)
  } catch {
    return undefined
  }

  return extractAssistantText(parsed)
}

function extractAssistantText(value: unknown): string | undefined {
  if (!isRecord(value) || value.type !== "assistant") {
    return undefined
  }

  const message = value.message
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return undefined
  }

  const texts = message.content.filter(isTextContent).map((item) => item.text)
  if (texts.length === 0) {
    return undefined
  }

  return texts.join("\n")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** JSONL の1行を、与えた `type` を持つ行だけに絞って、最後に出現したものを返す。 */
function latestLineOfType(content: string, type: string): Record<string, unknown> | undefined {
  const matches = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((line) => tryParseJson(line))
    .filter((value): value is Record<string, unknown> => isRecord(value) && value.type === type)

  return matches.at(-1)
}

function usageTotal(assistantLine: Record<string, unknown>): number | undefined {
  const message = assistantLine.message
  if (!isRecord(message)) {
    return undefined
  }

  const usage = message.usage
  if (!isRecord(usage)) {
    return undefined
  }

  const inputTokens = usage.input_tokens
  const cacheReadTokens = usage.cache_read_input_tokens
  const cacheCreationTokens = usage.cache_creation_input_tokens
  if (
    typeof inputTokens !== "number" ||
    typeof cacheReadTokens !== "number" ||
    typeof cacheCreationTokens !== "number"
  ) {
    return undefined
  }

  return inputTokens + cacheReadTokens + cacheCreationTokens
}

function pendingBackgroundAgentCountOf(value: unknown): number | undefined {
  if (!isRecord(value) || value.type !== "system") {
    return undefined
  }

  const count = value.pendingBackgroundAgentCount
  return typeof count === "number" ? count : undefined
}

/** JSON として不正な行を undefined に落とす。有効な JSON が undefined を返すことは無い。 */
function tryParseJson(line: string): unknown {
  try {
    return JSON.parse(line)
  } catch {
    return undefined
  }
}

function isTextContent(value: unknown): value is { readonly type: "text"; readonly text: string } {
  return isRecord(value) && value.type === "text" && typeof value.text === "string"
}

type ToolResultRecord = {
  readonly toolUseId: string
  readonly content: string
  readonly isError: boolean
}

function collectToolResults(values: readonly unknown[]): readonly ToolResultRecord[] {
  return values.flatMap((value) => toolResultsInLine(value))
}

function toolResultsInLine(value: unknown): readonly ToolResultRecord[] {
  if (!isRecord(value) || value.type !== "user") {
    return []
  }

  const message = value.message
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return []
  }

  return message.content.filter(isToolResultItem).map(toToolResultRecord)
}

function isToolResultItem(value: unknown): value is {
  readonly type: "tool_result"
  readonly tool_use_id: string
  readonly content: unknown
  readonly is_error: unknown
} {
  return isRecord(value) && value.type === "tool_result" && typeof value.tool_use_id === "string"
}

function toToolResultRecord(item: {
  readonly tool_use_id: string
  readonly content: unknown
  readonly is_error: unknown
}): ToolResultRecord {
  return {
    toolUseId: item.tool_use_id,
    content: toolResultContentText(item.content),
    isError: item.is_error === true,
  }
}

/**
 * tool_result の `content` は文字列のことが多いが、複数ブロックの配列のこともある（実測）。
 * テキストのブロックだけをつなぎ、テキスト以外（画像・`tool_reference` 等）は中身を持ち出さず
 * 種別のラベルだけ残す（会話内容の外部持ち出しを増やさないため）。
 */
function toolResultContentText(content: unknown): string {
  if (typeof content === "string") {
    return content
  }
  if (!Array.isArray(content)) {
    return ""
  }

  return content.map((item) => toolResultContentItemText(item)).join("\n\n")
}

function toolResultContentItemText(item: unknown): string {
  if (isTextContent(item)) {
    return item.text
  }
  if (isRecord(item) && typeof item.type === "string") {
    return `(${item.type})`
  }
  return ""
}

function mainViewEntriesInLine(
  value: unknown,
  results: readonly ToolResultRecord[],
  speechMarker: string,
): readonly MainViewEntry[] {
  if (!isRecord(value) || value.type !== "assistant") {
    return []
  }

  const message = value.message
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return []
  }

  return message.content.flatMap((item) => mainViewEntryForContentItem(item, results, speechMarker))
}

function mainViewEntryForContentItem(
  item: unknown,
  results: readonly ToolResultRecord[],
  speechMarker: string,
): readonly MainViewEntry[] {
  if (isToolUseItem(item)) {
    const result = results.find((entry) => entry.toolUseId === item.id)
    return [
      {
        kind: "tool",
        name: item.name,
        input: item.input,
        result:
          result === undefined ? undefined : { content: result.content, isError: result.isError },
      },
    ]
  }

  if (isTextContent(item)) {
    const detail = splitUtterance(item.text, speechMarker).detail.trim()
    return detail === "" ? [] : [{ kind: "detail", markdown: detail }]
  }

  return []
}

function isToolUseItem(value: unknown): value is {
  readonly type: "tool_use"
  readonly id: string
  readonly name: string
  readonly input: unknown
} {
  return (
    isRecord(value) &&
    value.type === "tool_use" &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  )
}

type ClassifiedLine = {
  readonly line: string
  readonly isSpeech: boolean
}

/**
 * 発話の各行に、セリフ行かどうかの印を付ける。コードブロック（``` で始まる行で開閉する範囲）の
 * 中は、マーカーで始まっていてもセリフ行として扱わない。
 */
function classifyLines(lines: readonly string[], speechMarker: string): readonly ClassifiedLine[] {
  const initial: { readonly inFence: boolean; readonly items: readonly ClassifiedLine[] } = {
    inFence: false,
    items: [],
  }

  const result = lines.reduce((acc, line) => {
    const isFenceDelimiter = line.trim().startsWith("```")
    const isSpeech = !isFenceDelimiter && !acc.inFence && line.startsWith(speechMarker)
    return {
      inFence: isFenceDelimiter ? !acc.inFence : acc.inFence,
      items: [...acc.items, { line, isSpeech }],
    }
  }, initial)

  return result.items
}

/**
 * セリフ行からマーカーを取り除き、まとまりごとに改行で、まとまり同士は空行でつないだ文字列を
 * 返す。
 */
function extractSpeech(
  classified: readonly ClassifiedLine[],
  speechMarker: string,
): string | undefined {
  const blocks = groupSpeechBlocks(classified, speechMarker)
  return blocks.length === 0 ? undefined : blocks.join("\n\n")
}

/** 連続するセリフ行を1つのまとまりにする。まとまりは出現順に並ぶ。 */
function groupSpeechBlocks(
  classified: readonly ClassifiedLine[],
  speechMarker: string,
): readonly string[] {
  const initial: { readonly blocks: readonly string[]; readonly current: readonly string[] } = {
    blocks: [],
    current: [],
  }

  const result = classified.reduce((acc, item) => {
    if (item.isSpeech) {
      return {
        blocks: acc.blocks,
        current: [...acc.current, stripSpeechMarker(item.line, speechMarker)],
      }
    }
    if (acc.current.length === 0) {
      return acc
    }
    return { blocks: [...acc.blocks, acc.current.join("\n")], current: [] }
  }, initial)

  return result.current.length === 0 ? result.blocks : [...result.blocks, result.current.join("\n")]
}

function stripSpeechMarker(line: string, speechMarker: string): string {
  return line.slice(speechMarker.length)
}

/** セリフ行を除いた残りの行を、発話中の順序のまま改行でつないだ文字列を返す。 */
function extractDetail(classified: readonly ClassifiedLine[]): string {
  return classified
    .filter((item) => !item.isSpeech)
    .map((item) => item.line)
    .join("\n")
}

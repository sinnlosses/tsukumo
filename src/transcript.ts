// transcript(JSONL) を読み、最新の assistant 発話を取り出し、セリフと詳細に分ける。「読む」層。
//
// JSONL の1行は外部由来（Claude Code が書き出すもの）なので構造を信用しない。
// unknown で受けて検証し、通った行だけを assistant の発話として扱う。
// 壊れた行・assistant 以外の行（未知の type を含む）は読み飛ばし、例外を投げない。

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

export type UtteranceParts = {
  readonly speech: string | undefined
  readonly detail: string
}

/**
 * 1つの発話を「セリフ」と「詳細」に分ける（`docs/requirements.md` 4.2、正典は
 * `~/.claude/output-styles/asuna.md`「セリフと詳細の書き分け」）。**規約はセリフを引用
 * （`> ` で始まる行）で書くことだけを決めており、tsukumo はそれを機械的に拾う**。
 * コードブロック（``` で囲まれた範囲）の中の `> ` は拾わない。
 *
 * - **規約に従っていない発話（セリフが1つも無い）**: `speech` は `undefined` を返す。
 *   直前のセリフを出し続けるかどうかは表示側の責務なので、ここでは決めない
 *   （`docs/requirements.md` 4.2「吹き出しは直前のセリフを出し続ける」）
 * - **引用が複数箇所に分かれているとき**: 出現順にすべて連結する。**セリフは役割
 *   （掛け声・リアクション・完了報告など）で書き分けられるものなので、後の引用が前の引用を
 *   上書きする理由が無い**。連続する引用行は改行で、離れた引用のまとまりは空行を挟んでつなぐ
 * - **ネストした引用（`> >`）**: 規約は引用を他の用途に使わないことを前提にしているので、
 *   特別扱いはしない。外側の `> ` だけを取り除き、残りはそのまま含める
 * - `detail` は発話から引用行を除いた残り。セリフが無ければ発話の全文がそのまま `detail` になる
 */
export function splitUtterance(utterance: string): UtteranceParts {
  const classified = classifyLines(utterance.split("\n"))

  return {
    speech: extractSpeech(classified),
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

function isTextContent(value: unknown): value is { readonly type: "text"; readonly text: string } {
  return isRecord(value) && value.type === "text" && typeof value.text === "string"
}

type ClassifiedLine = {
  readonly line: string
  readonly isQuote: boolean
}

/**
 * 発話の各行に、引用行（セリフ）かどうかの印を付ける。コードブロック（``` で始まる行で
 * 開閉する範囲）の中は、`> ` で始まっていても引用行として扱わない。
 */
function classifyLines(lines: readonly string[]): readonly ClassifiedLine[] {
  const initial: { readonly inFence: boolean; readonly items: readonly ClassifiedLine[] } = {
    inFence: false,
    items: [],
  }

  const result = lines.reduce((acc, line) => {
    const isFenceDelimiter = line.trim().startsWith("```")
    const isQuote = !isFenceDelimiter && !acc.inFence && line.startsWith("> ")
    return {
      inFence: isFenceDelimiter ? !acc.inFence : acc.inFence,
      items: [...acc.items, { line, isQuote }],
    }
  }, initial)

  return result.items
}

/** 引用行から「> 」を取り除き、まとまりごとに改行で、まとまり同士は空行でつないだ文字列を返す。 */
function extractSpeech(classified: readonly ClassifiedLine[]): string | undefined {
  const blocks = groupQuoteBlocks(classified)
  return blocks.length === 0 ? undefined : blocks.join("\n\n")
}

/** 連続する引用行を1つのまとまりにする。まとまりは出現順に並ぶ。 */
function groupQuoteBlocks(classified: readonly ClassifiedLine[]): readonly string[] {
  const initial: { readonly blocks: readonly string[]; readonly current: readonly string[] } = {
    blocks: [],
    current: [],
  }

  const result = classified.reduce((acc, item) => {
    if (item.isQuote) {
      return { blocks: acc.blocks, current: [...acc.current, stripQuoteMarker(item.line)] }
    }
    if (acc.current.length === 0) {
      return acc
    }
    return { blocks: [...acc.blocks, acc.current.join("\n")], current: [] }
  }, initial)

  return result.current.length === 0 ? result.blocks : [...result.blocks, result.current.join("\n")]
}

function stripQuoteMarker(line: string): string {
  return line.slice("> ".length)
}

/** 引用行を除いた残りの行を、発話中の順序のまま改行でつないだ文字列を返す。 */
function extractDetail(classified: readonly ClassifiedLine[]): string {
  return classified
    .filter((item) => !item.isQuote)
    .map((item) => item.line)
    .join("\n")
}

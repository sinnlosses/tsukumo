// transcript(JSONL) を読み、最新の assistant 発話を取り出す。「読む」層。
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

// サブエージェントの記録から、サイドバーに出してよい範囲の情報だけを取り出す。「読む」層。
//
// 個々のサブエージェントの記録は、主 transcript と同じ JSONL 形式で
// `<主 transcript のディレクトリ>/<session-id>/subagents/agent-<id>.jsonl` に、
// 隣に `agent-<id>.meta.json` が書かれる（実測）。
//
// - `agent-<id>.jsonl` からは**ツール名だけ**を取り出す。引数や出力は読み取らない・持ち出さない
//   （docs/coding-standards.md「会話内容の扱い」— サブエージェントの記録も本体の transcript と
//   同じく生の会話・ツール実行の中身を含むため、同じ扱いにする）
// - `agent-<id>.meta.json` の `description`（Agent ツールに渡す短いタスクラベル）と `model` は
//   会話内容ではなく、こちら側が付けたラベルなので出してよい（ユーザーとの合意事項）
//
// transcript.ts と同じく、ここはファイルI/Oを持たない。ディレクトリの列挙とファイルを読むのは
// src/index.ts。

/**
 * 1つのサブエージェントの transcript 全文から、直近に使われたツールの名前を取り出す。
 * `type: "assistant"` の行の `message.content` に含まれる `tool_use` のうち、
 * 最後に出現したものの `name` を返す。ツールが1つも使われていなければ undefined。
 *
 * **「今も走っているか」は判定しない。** ファイルだけからは確実に判定できないため
 * （`docs/architecture.md`「既知の制約・注意点」に対応する調査結果は無く、
 * この関数は直近の活動の中身だけを返す）。
 */
export function extractLatestToolName(content: string): string | undefined {
  const names = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .flatMap((line) => toolNamesInLine(line))

  return names.at(-1)
}

/** `agent-<id>.meta.json` から取り出す、サイドバーに出してよい範囲の値。 */
export type AgentMeta = {
  /** Agent ツールに渡された短いタスクラベル（会話内容ではない）。 */
  readonly description: string | undefined
  readonly model: string | undefined
}

/**
 * サブエージェントの meta.json の内容から `description` と `model` を取り出す。
 * JSON として不正、またはトップレベルがオブジェクトでないときは undefined を返す
 * （meta.json 自体が無いのと同じ扱いにできるようにする）。
 * `description` / `model` は個別に検証し、文字列でない・無いときはその項目だけ undefined にする
 * （どちらか片方が壊れていても、もう片方まで捨てない）。
 */
export function extractAgentMeta(content: string): AgentMeta | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }

  if (!isRecord(parsed)) {
    return undefined
  }

  return {
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    model: typeof parsed.model === "string" ? parsed.model : undefined,
  }
}

function toolNamesInLine(line: string): readonly string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return []
  }

  if (!isRecord(parsed) || parsed.type !== "assistant") {
    return []
  }

  const message = parsed.message
  if (!isRecord(message) || !Array.isArray(message.content)) {
    return []
  }

  return message.content.filter(isToolUse).map((item) => item.name)
}

function isToolUse(value: unknown): value is { readonly type: "tool_use"; readonly name: string } {
  return isRecord(value) && value.type === "tool_use" && typeof value.name === "string"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

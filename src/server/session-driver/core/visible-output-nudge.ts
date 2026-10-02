// Claude Code 本体が「本文の無い応答」に差し込む催促（`[Your previous response had no visible output. ...]`）への対処。
// ターンが `speak` のツール呼び出しで終わると、本体はこの固定文を利用者の発言として差し込み、モデルの呼び出しが1往復増える。
//
// 塞ぐのはここ（環境変数と見張り）だけで、文面の条（最後の `speak` のあとに1行書かせる）は重ねない。
// `report` を呼ばないターンで、その1行が最終レポートとして画面に出る（`docs/architecture/chat-mode.md`「雑談モード」）。
//
// 環境変数 `CLAUDE_CODE_TERMINAL_MCP_TOOLS` は公式の文書に無い。
// 同梱の `claude` 2.1.281 を読んだ判定: `stop_reason` が `end_turn` で応答に空でないテキストが無くても、直前の利用者側のメッセージが `tool_result` だけで、その中に成功した呼び出しがありツール名がこの変数に載っていれば催促しない。
// 本体の更新で黙って効かなくなりうるので、催促が届いたことに気づく `isVisibleOutputNudge` を一緒に置く。
//
// 本体のもう1つの催促（attachment `silent_turn_reminder`。"The user hasn't heard from you in a while. …" を `<system-reminder>` で差し込む）も、環境変数 `CLAUDE_CODE_SILENT_TURN_REMINDER` で切る。
// 本体は `speak` を利用者に見える出力に数えないので、`speak` だけのステップが続くとこの催促が入る。
// 同梱の `claude` 2.1.283 を読んだ判定: 環境変数の表でこの変数は3値の真偽（`"1"` / `"true"` / `"yes"` / `"on"` は true、`"0"` / `"false"` / `"no"` / `"off"` は false、それ以外は未指定）。
// 能力の判定は、この変数が未指定でなければその値を返し、false なら attachment を作らない。

import { isPlainObject } from "remeda"

import { SPEAK_TOOL_NAME, tsukumoToolFullName } from "./tsukumo-tool-name.ts"

/** 本体が「このツールの呼び出しで終わるターンは正常」と扱うツール名の一覧を受け取る環境変数。 */
export const TERMINAL_MCP_TOOLS_ENV_NAME = "CLAUDE_CODE_TERMINAL_MCP_TOOLS"

/** 本体の `silent_turn_reminder` を切り替える環境変数。 */
export const SILENT_TURN_REMINDER_ENV_NAME = "CLAUDE_CODE_SILENT_TURN_REMINDER"

/** 本体の催促の固定文の先頭。見分けるのはこの先頭だけで、届いたメッセージの中身は持ち出さない。 */
const VISIBLE_OUTPUT_NUDGE_PREFIX = "[Your previous response had no visible output."

/**
 * 子プロセス（claude）に渡す環境変数。引き継いだ環境に足す。
 * SDK の `env` は tsukumo 自身の環境と混ぜずに丸ごと置き換えるので、`PATH` や `HOME` を落とさないように引き継ぎを先に広げる。
 *
 * 終わってよいツールに載せるのは `speak` だけ。
 * 通った `report` は結果の `claude/endTurn` でそこでターンを閉じ、そのあとにモデルの応答が無いので、催促の判定に掛からない。
 * `silent_turn_reminder` は `"0"` で切る。
 * 仕事・雑談の両方で同じ値を渡す。
 */
export function childProcessEnv(
  inherited: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  return {
    ...inherited,
    [TERMINAL_MCP_TOOLS_ENV_NAME]: tsukumoToolFullName(SPEAK_TOOL_NAME),
    [SILENT_TURN_REMINDER_ENV_NAME]: "0",
  }
}

/**
 * SDK から届いたメッセージが本体の催促か。
 * 催促は `type: "user"` で、`content` が固定文の文字列（か、その文字列を1つだけ持つ `text` ブロック）として届く。
 * 環境変数が効かなくなったことに気づくためのもので、中身は読まず先頭だけを見る。
 */
export function isVisibleOutputNudge(message: unknown): boolean {
  if (!isPlainObject(message) || message.type !== "user" || !isPlainObject(message.message)) {
    return false
  }
  const { content } = message.message
  if (typeof content === "string") {
    return content.startsWith(VISIBLE_OUTPUT_NUDGE_PREFIX)
  }
  if (!Array.isArray(content) || content.length !== 1) {
    return false
  }
  const [block] = content
  return (
    isPlainObject(block) &&
    block.type === "text" &&
    typeof block.text === "string" &&
    block.text.startsWith(VISIBLE_OUTPUT_NUDGE_PREFIX)
  )
}

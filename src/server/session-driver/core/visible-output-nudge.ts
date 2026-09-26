// Claude Code 本体が「本文の無い応答」に差し込む催促（`[Your previous response had no visible
// output. ...]`）への対処。ターンが `speak` のツール呼び出しで終わると、本体はこの固定文を利用者の
// 発言として差し込み、モデルの呼び出しが1往復増える（`docs/chat-mode.md` 4.9「雑談モードで
// 変わるもの」）。
//
// 塞ぐのはここ（環境変数と見張り）だけ。以前は文面の条（最後の `speak` のあとに「完了」の1行だけ
// 書かせる）も重ねていたが、`report` を呼ばないターンでその1行が最終レポートとして画面に出たので
// 外した（経緯は `docs/chat-mode.md` 4.9）。
//
// 環境変数 `CLAUDE_CODE_TERMINAL_MCP_TOOLS` は公式の文書に無い（同梱の `claude` 2.1.281 を
// 読んだ判定: `stop_reason` が `end_turn` で応答に空でないテキストが無くても、直前の利用者側の
// メッセージが `tool_result` だけで、その中に成功した呼び出しがありツール名がこの変数に載って
// いれば催促しない）。本体の更新で黙って効かなくなりうるので、催促が届いたことに気づく
// {@link isVisibleOutputNudge} を一緒に置く。
//
// 「決める」内容だけで、外の世界には触らない（原則2）。子プロセスへ渡すのは
// `src/server/session-driver/adapter/sdk-driver.ts`、環境変数を読むのは `src/cli.ts`。

import { isPlainObject } from "remeda"

import { SPEAK_TOOL_NAME, tsukumoToolFullName } from "./sdk-message.ts"

/** 本体が「このツールの呼び出しで終わるターンは正常」と扱うツール名の一覧を受け取る環境変数。 */
export const TERMINAL_MCP_TOOLS_ENV_NAME = "CLAUDE_CODE_TERMINAL_MCP_TOOLS"

/**
 * 本体の催促の固定文の先頭。見分けるのはこの先頭だけで、届いたメッセージの中身は持ち出さない
 * （`docs/coding-standards.md`「会話内容の扱い」）。
 */
const VISIBLE_OUTPUT_NUDGE_PREFIX = "[Your previous response had no visible output."

/**
 * 子プロセス（claude）に渡す環境変数。引き継いだ環境に足す（SDK の `env` は tsukumo 自身の環境と
 * 混ぜずに丸ごと置き換えるので、`PATH` や `HOME` を落とさないように引き継ぎを先に広げる）。
 *
 * 載せるのは `speak` だけ。`report` は締めの `speak` より前に呼ぶので、`report` で終わるターンは
 * 無い。仕事・雑談の両方で同じ値を渡す（どちらも `speak` で終わる）。
 */
export function childProcessEnv(
  inherited: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  return { ...inherited, [TERMINAL_MCP_TOOLS_ENV_NAME]: tsukumoToolFullName(SPEAK_TOOL_NAME) }
}

/**
 * SDK から届いたメッセージが本体の催促か。催促は `type: "user"` で、`content` が固定文の文字列
 * （か、その文字列を1つだけ持つ `text` ブロック）として届く。環境変数が効かなくなったことに
 * 気づくためのもので、中身は読まず先頭だけを見る。
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

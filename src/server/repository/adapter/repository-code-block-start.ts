// git 管理下のファイルを読み、`Code` の塊の頭の行が何行目かを返す。
// 例外を投げない。決められないときは `unknown`。

import {
  type CodeBlockStart,
  type CodeBlockStartRequest,
  UNKNOWN_CODE_BLOCK_START,
} from "../../../shared/repository/code-block-start.ts"
import { readTrackedText } from "./repository-file-excerpt.ts"

/** 塊の中身とファイルの中身から、頭の行（1 始まり）を決める関数。決められないときは `undefined`。 */
type LocateStartLine = (
  block: Pick<CodeBlockStartRequest, "language" | "source">,
  fileContent: string,
) => number | undefined

export async function readCodeBlockStart(
  cwd: string,
  request: CodeBlockStartRequest,
  listFiles: () => Promise<readonly string[]>,
  locate: LocateStartLine,
): Promise<CodeBlockStart> {
  const content = await readTrackedText(cwd, request.path, listFiles)
  if (content.kind === "unavailable") {
    return UNKNOWN_CODE_BLOCK_START
  }
  const startLine = locate(request, content.text)
  return startLine === undefined ? UNKNOWN_CODE_BLOCK_START : { kind: "line", startLine }
}

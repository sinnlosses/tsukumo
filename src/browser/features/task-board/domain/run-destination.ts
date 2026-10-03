// 「tsukumo に頼む」の文面の送り先（`/` で始まる最初の語のコマンド）が、いまのセッションに在るか。

import type { CommandDescription } from "../../../../shared/session/session-event.ts"

/**
 * - `present`: 在る
 * - `missing`: 無い（コマンドの一覧が届いていて、そこに載っていない）
 * - `unknown`: 判定できない（一覧がまだ届いていない・文面が `/` で始まらない）
 */
export type RunDestination =
  | { readonly kind: "present" }
  | { readonly kind: "missing"; readonly command: string }
  | { readonly kind: "unknown" }

export function runDestinationOf(
  template: string,
  commands: readonly CommandDescription[],
): RunDestination {
  const command = /^\/(\S+)/.exec(template)?.[1]
  if (command === undefined || commands.length === 0) {
    return { kind: "unknown" }
  }
  return commands.some((candidate) => candidate.name === command)
    ? { kind: "present" }
    : { kind: "missing", command }
}

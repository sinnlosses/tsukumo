// タスクの再試で起こす `claude -p` に渡す環境変数を決める、という概念1つを持つ。外に触らない。

const INHERITED_SESSION_PREFIXES = [
  "CLAUDE_CODE_",
  "CLAUDECODE",
  "CLAUDE_AGENT_SDK",
  "ORCA_",
] as const

/**
 * 今のセッションの目印（`CLAUDE_CODE_SESSION_ID`・orca の hook の合言葉など）を落とす。
 * 残すとタスクの再試の claude が今のセッションの子や orca のタブの一員として振る舞ってしまう。
 * 認証は環境変数ではなくキーチェーン側にあるので、落としても効く。
 */
export function replayEnvironment(
  env: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined &&
        !INHERITED_SESSION_PREFIXES.some((prefix) => entry[0].startsWith(prefix)),
    ),
  )
}

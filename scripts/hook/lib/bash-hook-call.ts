// hook が標準入力へ流す JSON から、Bash ツールの呼び出しのうち入口が見るところを取り出す。

/** Bash ツールの hook の入力のうち、入口が見るところ。`event` は `hook_event_name`（`PreToolUse` など）。 */
export type BashHookCall = {
  readonly command: string
  readonly cwd: string | undefined
  readonly runsInBackground: boolean
  readonly fromSubagent: boolean
  readonly toolUseId: string | undefined
  readonly event: string | undefined
}

/** hook が stdin へ流す JSON から Bash の呼び出しを取り出す。壊れた JSON・Bash 以外・形が違えば `undefined`。 */
export function parseBashHookCall(rawInput: string): BashHookCall | undefined {
  const input = safeParse(rawInput)
  if (readField(input, "tool_name") !== "Bash") {
    return undefined
  }

  const toolInput = readField(input, "tool_input")
  const command = readField(toolInput, "command")
  if (typeof command !== "string") {
    return undefined
  }

  return {
    command,
    cwd: readString(input, "cwd"),
    runsInBackground: readField(toolInput, "run_in_background") === true,
    fromSubagent: typeof readField(input, "agent_id") === "string",
    toolUseId: readString(input, "tool_use_id"),
    event: readString(input, "hook_event_name"),
  }
}

function readField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined
}

function readString(value: unknown, key: string): string | undefined {
  const field = readField(value, key)
  return typeof field === "string" ? field : undefined
}

function safeParse(rawInput: string): unknown {
  try {
    return JSON.parse(rawInput)
  } catch {
    return undefined
  }
}

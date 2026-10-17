// `pnpm run check` の段の子を、どの優先度の前置き（`taskpolicy` の QoS の clamp か `nice`）で起こすかを決める、という概念1つを持つ。

import { accessSync, constants } from "node:fs"
import { delimiter, join } from "node:path"

/** 段を起こす前置きの道具。`taskpolicy` は macOS にだけある。 */
export type PriorityTool = "taskpolicy" | "nice"

export type StageCommand = {
  readonly command: string
  readonly args: readonly string[]
}

const CLAMP = "utility"
const TASKPOLICY = "taskpolicy"

/** `pathValue`（`PATH` の値）のどこかに実行できる `taskpolicy` があれば `taskpolicy`、無ければ `nice`。 */
export function findPriorityTool(pathValue: string): PriorityTool {
  const found = pathValue
    .split(delimiter)
    .some((directory) => directory !== "" && isExecutable(join(directory, TASKPOLICY)))
  return found ? "taskpolicy" : "nice"
}

/**
 * 段 `stageName` を `pnpm run` で起こすコマンド。
 * E2E の段は clamp を掛けると負荷に敏感な場面が落ちるので、`taskpolicy` があっても `nice` で起こす。
 */
export function stageCommand(
  stageName: string,
  stageArgs: readonly string[],
  tool: PriorityTool,
): StageCommand {
  const pnpmArgs = ["pnpm", "run", stageName, ...stageArgs]
  if (tool === "taskpolicy" && stageName !== "test:e2e") {
    return { command: TASKPOLICY, args: ["-c", CLAMP, ...pnpmArgs] }
  }
  return { command: "nice", args: pnpmArgs }
}

function isExecutable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

// E2E の vitest が `pnpm run test:e2e` の入口を経て起きたかの門。
// 経ずにテストのファイルを名指さずに起きた vitest は全件を流し、回数の台帳を通らないので、
// サブエージェントの Bash の中では止める。ファイルを名指した直の起動は数えないので通す。

/** 入口が vitest に渡す、入口を経た印の環境変数。 */
export const E2E_ENTRY_VARIABLE = "TSUKUMO_E2E_ENTRY"

export const E2E_ENTRY_ENVIRONMENT = { [E2E_ENTRY_VARIABLE]: "1" } as const

const DIRECT_START_MESSAGE = `E2E の vitest をファイルを名指さずに、pnpm run test:e2e を経ずに起こさない（回数の上限を数えられない）。
  1本: pnpm run test:e2e test/e2e/<ファイル>.test.ts
  全件: pnpm run check --full`

/** 直の起動の様子。`args` は vitest の引数（`process.argv` の3つ目から）。 */
export type E2eStart = {
  readonly entryValue: string | undefined
  readonly args: readonly string[]
  readonly hasSubagentMark: boolean
}

/** 止めるなら理由、通すなら `undefined`。`entryValue` は `TSUKUMO_E2E_ENTRY` の値。 */
export function findDirectE2eStartRefusal(start: E2eStart): string | undefined {
  const namesTestFile = start.args.some((arg) => arg.endsWith(".test.ts"))
  return start.entryValue !== "1" && start.hasSubagentMark && !namesTestFile
    ? DIRECT_START_MESSAGE
    : undefined
}

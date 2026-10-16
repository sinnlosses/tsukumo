// `pnpm run test:e2e` を引数なしで（全件で）打つのを止める門。
// 全件が通るのは、環境変数 `TSUKUMO_E2E_FULL=1` を立てた呼び出しだけ。

export const E2E_FULL_VARIABLE = "TSUKUMO_E2E_FULL"

/** 全件の門を通す環境変数。 */
export const E2E_FULL_ENVIRONMENT = { [E2E_FULL_VARIABLE]: "1" } as const

export type E2eFullJudgement =
  | { readonly kind: "pass" }
  | { readonly kind: "deny"; readonly message: string }

const DENY_MESSAGE = `E2E を全件で起こす打ち方は止めた。
  全件: pnpm run check --full
  1本:  pnpm run test:e2e test/e2e/<ファイル>.test.ts  （-- を前に置かない。置くと絞り込みが効かず全件になる）
`

/**
 * 入口が組み立てのあとに型検査を打つか。`check` と `test:e2e:update`（ファイルなし）は
 * 全件の印を立てて入るので、型検査の段が別にある呼び出しとして省く。
 */
export function shouldTypecheckBeforeE2e(fullValue: string | undefined): boolean {
  return fullValue !== "1"
}

/** `args` は `test:e2e` に渡された引数、`fullValue` は `TSUKUMO_E2E_FULL` の値。 */
export function judgeE2eFull(
  args: readonly string[],
  fullValue: string | undefined,
): E2eFullJudgement {
  if (fullValue === "1") {
    return { kind: "pass" }
  }
  const hasFile = args.some((arg) => arg.endsWith(".test.ts"))
  const hasSeparator = args.includes("--")
  return hasFile && !hasSeparator ? { kind: "pass" } : { kind: "deny", message: DENY_MESSAGE }
}

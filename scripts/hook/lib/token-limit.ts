// コミットにステージしたファイルが大きくなりすぎていないかを判定し、拒否文を組み立てる。git には触らない。

/** 1 ファイルのトークン数の上限。`BYTES_PER_TOKEN` バイトを 1 トークンと数え、超えたら大きすぎる。 */
export const TOKEN_LIMIT = 5000
export const BYTES_PER_TOKEN = 4

/** 検査から外すパス。前方一致（末尾が `/` のもの）か完全一致。足すときはここだけを直す。 */
const EXEMPT_PATH_PATTERNS = [
  "pnpm-lock.yaml",
  "test/e2e/expected/",
  "docs/history/",
  "vendor/",
  "test/fixture/fake-session.json",
] as const satisfies readonly string[]

export type StagedChange = {
  readonly path: string
  /** HEAD でのバイト数。新規は `undefined`。名前変更・コピーは元のパスの HEAD のバイト数。 */
  readonly headBytes: number | undefined
  readonly stagedBytes: number
  readonly binary: boolean
}

export type OversizedFile = {
  readonly path: string
  readonly tokens: number
  /** HEAD からの増え幅（バイト）。新規はファイルの大きさそのもの。 */
  readonly growth: number
}

/** 上限を超えていて、新規か HEAD より大きくなったファイルを返す。 */
export function findOversizedFiles(changes: readonly StagedChange[]): readonly OversizedFile[] {
  return changes
    .filter((change) => !change.binary && !isExempt(change.path))
    .filter((change) => change.stagedBytes / BYTES_PER_TOKEN > TOKEN_LIMIT)
    .filter((change) => change.headBytes === undefined || change.stagedBytes > change.headBytes)
    .map((change) => ({
      path: change.path,
      tokens: Math.ceil(change.stagedBytes / BYTES_PER_TOKEN),
      growth: change.stagedBytes - (change.headBytes ?? 0),
    }))
}

export function formatTokenLimitRefusal(oversized: readonly OversizedFile[]): string {
  const lines = oversized.map(
    (file) =>
      `- ${file.path}: ${file.tokens} トークン（上限 ${TOKEN_LIMIT}）、HEAD から +${file.growth} バイト`,
  )
  const extensions = new Set(oversized.map((file) => extensionOf(file.path)))
  const steps = [...extensions].map((extension) => `- ${splitStepFor(extension)}`)
  return [
    `ステージしたファイルが ${TOKEN_LIMIT} トークン（${TOKEN_LIMIT * BYTES_PER_TOKEN} バイト）を超えていて、新規か HEAD より大きくなっています。`,
    ...lines,
    "",
    "分割の手順:",
    ...steps,
    "",
    "- 増やす分だけ、同じコミットで同じファイルの別の部分を減らす（別のファイルへ移す）。純増にならなければ通ります。",
    "- 分けたら `git add` し直してもう一度コミットする。`--no-verify` は使わない。",
    "- どうしても分けられない生成物なら、除外の定数（`scripts/hook/lib/token-limit.ts` の `EXEMPT_PATH_PATTERNS`）へ足すことを人に相談する。",
  ].join("\n")
}

function isExempt(path: string): boolean {
  return EXEMPT_PATH_PATTERNS.some((pattern) =>
    pattern.endsWith("/") ? path.startsWith(pattern) : path === pattern,
  )
}

function extensionOf(path: string): string {
  const name = path.split("/").at(-1) ?? path
  const dot = name.lastIndexOf(".")
  return dot === -1 ? "" : name.slice(dot)
}

function splitStepFor(extension: string): string {
  switch (extension) {
    case ".md":
      return "`.md`: `##` の節の境目で概念ごとのファイルに切る。元には見出しと移した先へのリンクだけを残し、`docs/` の「節の索引」表を更新する。"
    case ".ts":
    case ".tsx":
      return "`.ts`・`.tsx`: 1 ファイル 1 概念（ファイル名が概念になる単位。`helpers`・`utils`・`common` は作らない）で、関連する関数群を新ファイルへ移して import を直す。テストは鏡の位置の別ファイルに切る。"
    case ".css":
      return "`.css`: 部品ごとの `*.module.css` に切る。"
    default:
      return `\`${extension === "" ? "拡張子なし" : extension}\`: 区切りの良い境目で複数のファイルに切る。`
  }
}

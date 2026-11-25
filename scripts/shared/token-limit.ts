// コミットにステージしたファイルが大きくなりすぎていないかを判定し、警告文を組み立てる。git には触らない。

/** 1 ファイルのトークン数の上限。`BYTES_PER_TOKEN` バイトを 1 トークンと数え、超えたら大きすぎる。 */
const TOKEN_LIMIT = 6000
/** `docs/` 配下の `.md` の上限。それ以外は `TOKEN_LIMIT`。 */
const DOCUMENT_TOKEN_LIMIT = 12000
const BYTES_PER_TOKEN = 4

/** 検査から外すパス。前方一致（末尾が `/` のもの）か完全一致。足すときはここだけを直す。 */
const EXEMPT_PATH_PATTERNS = [
  "pnpm-lock.yaml",
  "test/e2e/expected/",
  "docs/history/",
  "docs/research/",
  "docs/architecture/architecture-map.toml",
  "vendor/",
  "src/browser/components/ui/theme-root/built/",
] as const satisfies readonly string[]

export type StagedChange = {
  readonly path: string
  /** HEAD でのバイト数。新規は `undefined`。名前変更・コピーは元のパスの HEAD のバイト数。 */
  readonly headBytes?: number
  readonly stagedBytes: number
  readonly binary: boolean
}

export type OversizedFile = {
  readonly path: string
  readonly tokens: number
  readonly limit: number
  /** HEAD からの増え幅（バイト）。新規はファイルの大きさそのもの。 */
  readonly growth: number
}

/** 上限を超えていて、新規か HEAD より大きくなったファイルを返す。 */
export function findOversizedFiles(changes: readonly StagedChange[]): readonly OversizedFile[] {
  return changes
    .filter((change) => !change.binary && !isExempt(change.path))
    .filter((change) => change.stagedBytes / BYTES_PER_TOKEN > limitOf(change.path))
    .filter((change) => change.headBytes === undefined || change.stagedBytes > change.headBytes)
    .map((change) => ({
      path: change.path,
      tokens: Math.ceil(change.stagedBytes / BYTES_PER_TOKEN),
      limit: limitOf(change.path),
      growth: change.stagedBytes - (change.headBytes ?? 0),
    }))
}

export type TokenCount = {
  readonly tokens: number
  readonly limit: number
  readonly status: "over" | "near" | "ok" | "exempt"
}

/** 上限の何割を超えたら近いと数えるか。 */
const NEAR_RATIO = 0.9

export function countTokens(path: string, bytes: number): TokenCount {
  const tokens = Math.ceil(bytes / BYTES_PER_TOKEN)
  return { tokens, limit: limitOf(path), status: statusOf(path, tokens) }
}

export function formatTokenLimitWarning(oversized: readonly OversizedFile[]): string {
  const lines = oversized.map(
    (file) =>
      `- ${file.path}: ${file.tokens} トークン（上限 ${file.limit}）、HEAD から +${file.growth} バイト`,
  )
  return [
    "ステージしたファイルが上限のトークン数（1 トークン = 4 バイト）を超えていて、新規か HEAD より大きくなっています。",
    ...lines,
    "",
    "コミットは止めません。`pnpm run token-limit`（`pnpm run check` の段）が見直しのドラフトに積みます。",
  ].join("\n")
}

/** 上限を超えたファイルを縮める手順。見直しのドラフトの本文に載せる。 */
export function splitStepsFor(paths: readonly string[]): readonly string[] {
  const extensions = new Set(paths.map(extensionOf))
  return [
    ...[...extensions].map(splitStepFor),
    "どうしても分けられない生成物なら、除外の定数（`scripts/shared/token-limit.ts` の `EXEMPT_PATH_PATTERNS`）へ足すことを人に相談する。",
  ]
}

function statusOf(path: string, tokens: number): TokenCount["status"] {
  if (isExempt(path)) return "exempt"
  const limit = limitOf(path)
  if (tokens > limit) return "over"
  return tokens > limit * NEAR_RATIO ? "near" : "ok"
}

function isExempt(path: string): boolean {
  return EXEMPT_PATH_PATTERNS.some((pattern) =>
    pattern.endsWith("/") ? path.startsWith(pattern) : path === pattern,
  )
}

function limitOf(path: string): number {
  return path.startsWith("docs/") && path.endsWith(".md") ? DOCUMENT_TOKEN_LIMIT : TOKEN_LIMIT
}

function extensionOf(path: string): string {
  const name = path.split("/").at(-1) ?? path
  const dot = name.lastIndexOf(".")
  return dot === -1 ? "" : name.slice(dot)
}

function splitStepFor(extension: string): string {
  switch (extension) {
    case ".md":
      return "`.md`: `##` の節の境目で概念ごとのファイルに切る。元からは移した節を消す（`docs/` の親の「目次」は `pnpm run format` が書き直し、子の一覧に1行足す）。"
    case ".ts":
    case ".tsx":
      return "`.ts`・`.tsx`: 1 ファイル 1 概念（ファイル名が概念になる単位。`helpers`・`utils`・`common` は作らない）で、関連する関数群を新ファイルへ移して import を直す。テストは鏡の位置の別ファイルに切る。"
    case ".css":
      return "`.css`: 部品ごとの `*.module.css` に切る。"
    default:
      return `\`${extension === "" ? "拡張子なし" : extension}\`: 区切りの良い境目で複数のファイルに切る。`
  }
}

// `docs/readme/configuration.md`「環境変数」節に載る `TSUKUMO_*` の名前を拾い、サーバが読む名前の表と双方向に照らす純粋関数。
// サーバ側の表（`ENV_NAMES`）は引数で受け、`scripts/` から `src/server/` を import しない。

const SECTION_HEADING = "### 環境変数"
const NEXT_SECTION_PATTERN = /^#{2,3}\s/u
// 表の行 `| \`NAME\`` と箇条書き `- \`NAME\`` の先頭の名前だけを拾う。説明の中の名前は拾わない。
const DOCUMENTED_NAME_PATTERN = /^(?:\||-)\s*`(TSUKUMO_[A-Z0-9_]+)`/u

export type DocumentedEnvironmentVariable = {
  readonly name: string
  /** 名前を書いている行（1始まり）。 */
  readonly line: number
}

export type EnvironmentVariableEntry = {
  readonly name: string
  readonly audience: "user" | "test"
}

export type EnvironmentVariableMismatch =
  | { readonly kind: "section-empty" }
  | { readonly kind: "user-name-undocumented"; readonly name: string }
  | { readonly kind: "documented-name-unknown"; readonly name: string; readonly line: number }

/** 「### 環境変数」節の行頭の名前を、行番号つきで返す。節が無ければ空。 */
export function findDocumentedEnvironmentVariables(
  text: string,
): readonly DocumentedEnvironmentVariable[] {
  const lines = text.split("\n")
  const start = lines.findIndex((line) => line.trimEnd() === SECTION_HEADING)
  if (start === -1) {
    return []
  }
  const rest = lines.slice(start + 1)
  const length = rest.findIndex((line) => NEXT_SECTION_PATTERN.test(line))
  return (length === -1 ? rest : rest.slice(0, length)).flatMap((line, index) => {
    const name = DOCUMENTED_NAME_PATTERN.exec(line)?.[1]
    return name === undefined ? [] : [{ name, line: start + 2 + index }]
  })
}

/**
 * (a) `audience: "user"` の名前が文書に無い、(b) 文書の名前が表にも `allowedExtra` にも無い、を返す。
 * `allowedExtra` はサーバの外（`scripts/` など）が読む名前。
 */
export function findEnvironmentVariableMismatches(input: {
  readonly documented: readonly DocumentedEnvironmentVariable[]
  readonly entries: readonly EnvironmentVariableEntry[]
  readonly allowedExtra: readonly string[]
}): readonly EnvironmentVariableMismatch[] {
  const { documented, entries, allowedExtra } = input
  if (documented.length === 0) {
    return [{ kind: "section-empty" }]
  }
  const documentedNames = new Set(documented.map((item) => item.name))
  const known = new Set([...entries.map((entry) => entry.name), ...allowedExtra])
  return [
    ...entries
      .filter((entry) => entry.audience === "user" && !documentedNames.has(entry.name))
      .map((entry) => ({ kind: "user-name-undocumented" as const, name: entry.name })),
    ...documented
      .filter((item) => !known.has(item.name))
      .map((item) => ({
        kind: "documented-name-unknown" as const,
        name: item.name,
        line: item.line,
      })),
  ]
}

export function formatEnvironmentVariableMismatch(mismatch: EnvironmentVariableMismatch): string {
  switch (mismatch.kind) {
    case "section-empty":
      return `「${SECTION_HEADING}」節が無いか、名前が1つも拾えない`
    case "user-name-undocumented":
      return `${mismatch.name}: audience が user なのに文書に載っていない`
    case "documented-name-unknown":
      return `${String(mismatch.line)} 行目 ${mismatch.name}: 文書にあるが ENV_NAMES にも例外の一覧にも無い`
  }
}

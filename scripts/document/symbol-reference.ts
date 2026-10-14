// 文書が「`src/…ts` の `シンボル`」の形で指している置き場所が、そのファイルに残っているかを照らす純粋関数。
//
// 拾う形は、パスとシンボルがそれぞれバッククォートで囲まれ、間が「の」と空白だけのものに限る。
// パスは `src` / `scripts` / `test` 以下の `.ts` / `.tsx`。
// シンボルは識別子で、`.` つなぎと末尾の `()` を許す。
// あいだに他の語が挟まるものとパスだけのものは、指している先が決まらないので拾わない。
//
// 照らすのは次の2つだけ。
// パスのファイルの実在。
// シンボルの頭の識別子（`Foo.bar` なら `Foo`）がファイルの本文に語として現れること。
//
// 対象の文書は次のとおり。
// `docs/` の `.md`（`docs/history/` と `docs/research/` を除く）。
// `README.md`。
// `CLAUDE.md`。
// `.claude/rules/` の `.md`。

/** 文書中の、ソースのシンボルを指す参照1つ。 */
export type SymbolReference = {
  /** 参照を書いている文書（リポジトリ直下からの相対パス）。 */
  readonly sourcePath: string
  /** 参照のある行（1始まり）。 */
  readonly line: number
  /** 指している先のソース（リポジトリ直下からの相対パス）。 */
  readonly targetPath: string
  /** 指しているシンボル（書かれたまま。`Foo.bar` / `foo()` の形もある）。 */
  readonly symbol: string
}

/** 照らした結果、置き場所が見つからなかった参照。 */
export type StraySymbolReference = SymbolReference & {
  /** パスのファイルそのものが読めなかったかどうか。 */
  readonly fileMissing: boolean
}

const SYMBOL_REFERENCE =
  /`((?:src|scripts|test)\/[^`\s]+\.tsx?)`[ \t]*の[ \t]*`([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\(\))?)`/gu

const UNCHECKED_DOCUMENT_PREFIXES = ["docs/history/", "docs/research/"] as const

/** 文書1つの本文から、シンボルを指す参照をすべて拾う。 */
export function findSymbolReferences(sourcePath: string, text: string): SymbolReference[] {
  return text
    .split("\n")
    .flatMap((lineText, index) =>
      [...lineText.matchAll(SYMBOL_REFERENCE)].flatMap((match) =>
        match[1] === undefined || match[2] === undefined
          ? []
          : [{ sourcePath, line: index + 1, targetPath: match[1], symbol: match[2] }],
      ),
    )
}

/**
 * 参照のうち、置き場所が見つからないものを返す。`sources` は指された先のパスから本文への対応で、
 * 無いパスは「ファイルが無い」として返す。
 */
export function findStraySymbolReferences(
  references: readonly SymbolReference[],
  sources: ReadonlyMap<string, string>,
): StraySymbolReference[] {
  return references.flatMap((reference): StraySymbolReference[] => {
    const source = sources.get(reference.targetPath)
    if (source === undefined) {
      return [{ ...reference, fileMissing: true }]
    }
    return containsWord(source, headIdentifier(reference.symbol))
      ? []
      : [{ ...reference, fileMissing: false }]
  })
}

/** 参照を拾う文書にするかどうか。パスはリポジトリ直下からの相対。 */
export function isSymbolCheckedDocument(path: string): boolean {
  if (!path.endsWith(".md")) {
    return false
  }
  if (UNCHECKED_DOCUMENT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return false
  }
  return (
    path.startsWith("docs/") ||
    path.startsWith(".claude/rules/") ||
    path === "README.md" ||
    path === "CLAUDE.md"
  )
}

/** 置き場所が見つからない参照1つを、一覧に出す1行にする。 */
export function formatStraySymbolReference(stray: StraySymbolReference): string {
  const reason = stray.fileMissing ? "ファイルが無い" : "シンボルが無い"
  return `${stray.sourcePath}:${stray.line}: ${stray.targetPath}の${stray.symbol}（${reason}）`
}

/** `Foo.bar` / `foo()` から頭の識別子（`Foo` / `foo`）を取り出す。 */
function headIdentifier(symbol: string): string {
  return symbol.replace(/\(\)$/u, "").split(".")[0] ?? symbol
}

/** `text` に `word` が識別子の一部ではなく語として現れるかどうか。 */
function containsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[$]/gu, "\\$&")
  return new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, "u").test(text)
}

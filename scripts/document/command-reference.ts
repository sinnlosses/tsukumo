// 文書（`.md`）が書いている実行コマンドのうち、実在しないものを拾う純粋関数。
//
// 拾うのは `pnpm run <名前>`（`package.json` の `scripts` に無い名前）と、`node scripts/….ts`
// （無いファイル）。`<`・`*`・`{`・`$`・`…` を含む書き方は見本なので拾わない。
// 過去の記録の `docs/history/` は照らさない。

export type CommandReference = {
  readonly sourcePath: string
  readonly line: number
  readonly command: string
  readonly kind: "pnpm-script" | "node-script"
}

const PNPM_SCRIPT = /pnpm run ([\w:.-]+)/gu
const NODE_SCRIPT = /node (scripts\/[^\s`*<{$…]+\.ts)/gu

/** 文書1つの本文から、`pnpm run` の名前と `node scripts/` のパスをすべて拾う。 */
export function findCommandReferences(sourcePath: string, text: string): CommandReference[] {
  if (!sourcePath.endsWith(".md") || sourcePath.startsWith("docs/history/")) {
    return []
  }
  return text.split("\n").flatMap((lineText, index) => [
    ...[...lineText.matchAll(PNPM_SCRIPT)].map((match) => ({
      sourcePath,
      line: index + 1,
      command: match[1] ?? "",
      kind: "pnpm-script" as const,
    })),
    ...[...lineText.matchAll(NODE_SCRIPT)].map((match) => ({
      sourcePath,
      line: index + 1,
      command: match[1] ?? "",
      kind: "node-script" as const,
    })),
  ])
}

/** 実在しない名前・パスを指す参照だけを返す。 */
export function findMissingCommandReferences(
  references: readonly CommandReference[],
  scriptNames: ReadonlySet<string>,
  fileExists: (path: string) => boolean,
): CommandReference[] {
  return references.filter((reference) =>
    reference.kind === "pnpm-script"
      ? !scriptNames.has(reference.command)
      : !fileExists(reference.command),
  )
}

export function formatMissingCommandReference(reference: CommandReference): string {
  const label = reference.kind === "pnpm-script" ? "pnpm run" : "node"
  return `${reference.sourcePath}:${reference.line}: 実在しないコマンド \`${label} ${reference.command}\``
}

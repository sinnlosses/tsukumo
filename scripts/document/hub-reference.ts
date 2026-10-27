// 正典のハブ（本文を持たず、子のファイルへの目次だけを持つファイル）を「句」付きで指す参照を拾い、
// 件数を凍結した一覧と照らす純粋関数。
//
// 句付きでハブを指す参照は、ハブを開いてから子を探す2段目を要するので、「正典から正典へ参照は
// 1段」を破るものとみなす。既存の該当は書いているファイルごとの件数で凍結し、
// 新しく足した参照（件数が増えたファイル）だけを落とす。貼り替えて減らしたら、一覧も減らす。

import type { SectionReference } from "./section-reference.ts"

/** 凍結した一覧と食い違ったファイル1つ。 */
export type HubReferenceDrift = {
  readonly sourcePath: string
  readonly actual: number
  readonly frozen: number
}

/**
 * `docs/X.md` の子 `docs/X/*.md` が1つでもあれば、`docs/X.md` はハブ。
 * `markdownPaths` は実在する `.md` の相対パスの一覧。
 */
export function findHubPaths(markdownPaths: readonly string[]): Set<string> {
  return new Set(
    markdownPaths.filter((path) => {
      const childPrefix = `${path.slice(0, -".md".length)}/`
      return markdownPaths.some((other) => other.startsWith(childPrefix))
    }),
  )
}

/** 参照のうち、`hubPaths` のハブを指すものを返す。 */
export function findHubReferences(
  references: readonly SectionReference[],
  hubPaths: ReadonlySet<string>,
): SectionReference[] {
  return references.filter((reference) => hubPaths.has(reference.targetPath))
}

/** 書いているファイルごとの参照の件数。 */
export function countBySource(references: readonly SectionReference[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const { sourcePath } of references) {
    counts[sourcePath] = (counts[sourcePath] ?? 0) + 1
  }
  return counts
}

/**
 * 件数が凍結した一覧と合わないファイルを返す。増えたものは新しい参照、減ったものは
 * 一覧を減らし忘れている。
 */
export function findHubReferenceDrifts(
  actual: Readonly<Record<string, number>>,
  frozen: Readonly<Record<string, number>>,
): HubReferenceDrift[] {
  return [...new Set([...Object.keys(actual), ...Object.keys(frozen)])]
    .toSorted()
    .map((sourcePath) => ({
      sourcePath,
      actual: actual[sourcePath] ?? 0,
      frozen: frozen[sourcePath] ?? 0,
    }))
    .filter((drift) => drift.actual !== drift.frozen)
}

/** 食い違い1つを、一覧に出す1行にする。 */
export function formatHubReferenceDrift(drift: HubReferenceDrift): string {
  const hint =
    drift.actual > drift.frozen
      ? "ハブを句付きで指す参照が増えた。子のファイルを直接指す"
      : "参照が減った。凍結の一覧の件数を減らす"
  return `${drift.sourcePath}: 凍結 ${drift.frozen} 件 → 実際 ${drift.actual} 件（${hint}）`
}

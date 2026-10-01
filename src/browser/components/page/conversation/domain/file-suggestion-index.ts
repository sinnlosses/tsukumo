// 入力欄の `@` ファイル補完の、候補の元（git 管理下のパス）の索引と絞り込み。
//
// 索引は一覧を取ったときに1回だけ作り（辞書順に並べ、小文字の綴りを添える）、打鍵ごとは絞り込みだけを行う。
// 前方一致を先に、続けて部分一致を出す。各グループの中は辞書順で、合計最大 `MAX_FILE_SUGGESTIONS` 件。
// 大文字小文字は区別せず、打った綴りのまま `README.md` のようなパスに当てられるようにしてある。

import { identity, sortBy } from "remeda"

const MAX_FILE_SUGGESTIONS = 10

export type FilePathEntry = {
  readonly path: string
  readonly lowerPath: string
}

/** 辞書順に並んだパスと、その小文字の綴り。 */
export type FileSuggestionIndex = readonly FilePathEntry[]

export function indexFilePaths(paths: readonly string[]): FileSuggestionIndex {
  return sortBy(paths, identity()).map((path) => ({ path, lowerPath: path.toLowerCase() }))
}

/**
 * 打った文字列に前方一致→部分一致で絞り込んだパス。合計最大 {@link MAX_FILE_SUGGESTIONS} 件。
 * 大文字小文字は区別しない。
 */
export function matchingFilePaths(index: FileSuggestionIndex, term: string): readonly string[] {
  const needle = term.toLowerCase()
  const prefixMatches: string[] = []
  const partialMatches: string[] = []
  for (const { path, lowerPath } of index) {
    if (lowerPath.startsWith(needle)) {
      prefixMatches.push(path)
      if (prefixMatches.length === MAX_FILE_SUGGESTIONS) {
        break
      }
    } else if (partialMatches.length < MAX_FILE_SUGGESTIONS && lowerPath.includes(needle)) {
      partialMatches.push(path)
    }
  }
  return [...prefixMatches, ...partialMatches].slice(0, MAX_FILE_SUGGESTIONS)
}

// 衝突の印が行頭に残っているかを見る純粋関数。
// `=======` は Markdown の見出しの下線にもなるので見ない。
// `|||||||` は merge.conflictstyle diff3 の印で、手で解くと `<<<<<<<` と `>>>>>>>` だけ消してこれが残りやすい。

const MARKERS = [
  { marker: "<<<<<<< ", pattern: /^<{7} /u },
  { marker: "||||||| ", pattern: /^\|{7} /u },
  { marker: ">>>>>>> ", pattern: /^>{7} /u },
] as const

/** 衝突の印1つ。 */
export type ConflictMarker = {
  /** 印が見つかったファイル（リポジトリ直下からの相対パス）。 */
  readonly path: string
  /** 印がある行（1始まり）。 */
  readonly line: number
  /** 見つかった印そのもの。 */
  readonly marker: (typeof MARKERS)[number]["marker"]
}

/** `path` のファイルの本文から、衝突の印をすべて拾う。 */
export function findConflictMarkers(path: string, text: string): ConflictMarker[] {
  const lines = text.split("\n")
  return lines.flatMap((lineText, index) =>
    MARKERS.filter(({ pattern }) => pattern.test(lineText)).map(({ marker }) => ({
      path,
      line: index + 1,
      marker,
    })),
  )
}

/** 衝突の印1つを、一覧に出す1行にする。 */
export function formatConflictMarker(found: ConflictMarker): string {
  return `${found.path}:${found.line}: ${found.marker.trim()}`
}

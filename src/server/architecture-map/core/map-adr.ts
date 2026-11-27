// 箱の `links.adr`（決定の記録のパス）と、そのファイルの先頭の見出しから、地図の説明の枠に出す番号と題を作る。

import type { MapViewAdr } from "../../../shared/architecture-map/map-view.ts"

/** ファイル名の頭の4桁の番号（`0001-render-in-browser.md` の `0001`）。 */
const NUMBER_PATTERN = /^(\d{4})-/

/** 見出しの末尾の、年月日の数字だけの全角括弧。 */
const TRAILING_DATE_PATTERN = /\s*（\d{4}-\d{2}-\d{2}）\s*$/

/** パスと、読めたファイルの本文（読めなければ無い）から出す行を作る。題が作れなければパスをそのまま題にする。 */
export function adrEntryOf(path: string, markdown?: string): MapViewAdr {
  const title = markdown === undefined ? undefined : adrTitleOf(markdown)
  if (title === undefined) {
    return { path, title: path }
  }
  const number = NUMBER_PATTERN.exec(path.slice(path.lastIndexOf("/") + 1))?.[1]
  return { path, ...(number === undefined ? {} : { number }), title }
}

/**
 * 見出しの行（`# ` で始まる最初の行）から題を作る。末尾の日付の括弧と、`: ` 以降の副題を除く。
 * 見出しが無い・除いたら空になるときは undefined。
 */
function adrTitleOf(markdown: string): string | undefined {
  const heading = markdown.split(/\r?\n/).find((line) => line.startsWith("# "))
  if (heading === undefined) {
    return undefined
  }
  const withoutDate = heading.slice(2).replace(TRAILING_DATE_PATTERN, "")
  const colon = withoutDate.search(/[:：]\s/)
  const title = (colon === -1 ? withoutDate : withoutDate.slice(0, colon)).trim()
  return title === "" ? undefined : title
}

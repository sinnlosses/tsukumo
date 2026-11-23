// 箱のバッジの値と、送る依頼の頭に入れる1行（`{{map: <ID>}} <表示名>（<縮尺>の箱）: <役割>`）の組み立てと読み戻し。
// 表示名を1行に入れるのは、吹き出しが地図を引かずにバッジ（表示名と縮尺）を描けるようにするため。

import type { MapLevel } from "../../../shared/architecture-map/architecture-map.ts"

export const MAP_LEVEL_TEXT = { 1: "大", 2: "中", 3: "小" } as const satisfies Record<
  MapLevel,
  string
>

export type MapBoxBadgeValue = {
  readonly id: string
  readonly title: string
  readonly level: MapLevel
  readonly summary?: string
}

const MENTION_LINE = /^\{\{map: (\S+?)\}\} (.+?)（(大|中|小)の箱）(?:: (.*))?$/
const SLASH_COMMAND = /^\//

/** 文面が slash コマンドで始まるときは、コマンドの行を先頭に保ち、その次の行に入れる。 */
export function withMapBoxMention(text: string, badge: MapBoxBadgeValue): string {
  const line = mapBoxMentionLine(badge)
  if (!SLASH_COMMAND.test(text)) {
    return `${line}\n${text}`
  }
  const lineEnd = text.indexOf("\n")
  return lineEnd === -1
    ? `${text}\n${line}`
    : `${text.slice(0, lineEnd)}\n${line}${text.slice(lineEnd)}`
}

export type SplitMention = {
  readonly badge?: MapBoxBadgeValue
  /** 1行目を抜いた残り。1行目が頭の1行でなければ文面そのまま。 */
  readonly rest: string
}

/** 文面の1行目が頭の1行なら、バッジの値と残りに分ける。読めない1行は字のまま残す。 */
export function splitMapBoxMention(text: string): SplitMention {
  const lineEnd = text.indexOf("\n")
  const first = lineEnd === -1 ? text : text.slice(0, lineEnd)
  const match = MENTION_LINE.exec(first)
  const [, id, title, levelText, summary] = match ?? []
  if (id === undefined || title === undefined || levelText === undefined) {
    return { rest: text }
  }
  const badge: MapBoxBadgeValue = {
    id,
    title,
    level: levelText === "大" ? 1 : levelText === "中" ? 2 : 3,
    ...(summary === undefined || summary === "" ? {} : { summary }),
  }
  return { badge, rest: lineEnd === -1 ? "" : text.slice(lineEnd + 1) }
}

function mapBoxMentionLine(badge: MapBoxBadgeValue): string {
  const head = `{{map: ${badge.id}}} ${oneLine(badge.title)}（${MAP_LEVEL_TEXT[badge.level]}の箱）`
  return badge.summary === undefined ? head : `${head}: ${oneLine(badge.summary)}`
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

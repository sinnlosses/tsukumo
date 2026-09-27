// セッションの短縮ID（`docs/glossary.md`「短縮ID」）。セッションID（UUID）の先頭2字を大文字にし、
// 並べる中で重なったときだけ3字に伸ばす。3字でも重なるものはそのまま（見分けは見出しと時刻に任せる）。

/** ふだんの長さと、重なったときに伸ばす長さ。 */
const SHORT_ID_LENGTH = 2
const EXTENDED_SHORT_ID_LENGTH = 3

/**
 * 並べるセッションIDそれぞれの短縮ID。重なりは渡した並びの中だけで見る
 * （一覧に無いセッションと重なっても、画面の上では見分ける相手がいない）。
 */
export function shortSessionIds(sessionIds: readonly string[]): ReadonlyMap<string, string> {
  const unique = [...new Set(sessionIds)]
  return new Map(
    unique.map((sessionId) => {
      const short = prefixOf(sessionId, SHORT_ID_LENGTH)
      const collides = unique.some(
        (other) => other !== sessionId && prefixOf(other, SHORT_ID_LENGTH) === short,
      )
      return [sessionId, collides ? prefixOf(sessionId, EXTENDED_SHORT_ID_LENGTH) : short]
    }),
  )
}

function prefixOf(sessionId: string, length: number): string {
  return sessionId.slice(0, length).toUpperCase()
}

// `location.hash` の書き方を決める唯一の場所。**1本の hash を2つの store が読む**
// （出している画面は `stores/screen.tsx`、見ているターンは `stores/turn-selection.tsx`）ので、
// 片方が書くときにもう片方の部分を消さないよう、読み書きはここの {@link HashRoute} を通す。
//
// 形は `#<画面>?turn=<番号>`。**画面は `?` の前、ターンは `turn` の値**:
//
// - `#`                   会話の画面・今回に追従（リンクの `href` に空文字を書けないので `#`）
// - `#?turn=3`            会話の画面・通し番号 3 のターンに留める
// - `#character?turn=3`   キャラクター画面。ターンは会話の画面へ戻ったときのために運ぶ
//
// **今回に追従しているときは `turn` を書かない。** 留めたターンだけが URL に乗るので、何も
// 選んでいない人のリロードは今までどおり今回を出す。

import { useSyncExternalStore } from "react"

const SCREENS = ["conversation", "character", "character-create", "token-usage"] as const

/** 出している画面。hash が対応しない値のときは会話の画面に落ちる。 */
export type Screen = (typeof SCREENS)[number]

/**
 * 見ているターン。`"newest"` は今回に追従する（新しいターンが始まればそちらへ移る）。
 * 番号はそのターン（`shared/main-view.ts` の `mainViewTurns` が振る通し番号）に留める。
 *
 * **プリミティブの合併にしてある**のは、`useSyncExternalStore` のスナップショットにそのまま
 * 使えるようにするため（オブジェクトだと読むたびに別物になり、描き直しが止まらない）。
 */
export type ViewedTurn = "newest" | number

export type HashRoute = {
  readonly screen: Screen
  readonly turn: ViewedTurn
}

/** hash の値の型。スナップショットが同じ値なら描き直さないよう、プリミティブに限る。 */
type HashSnapshot = string | number

/** 画面と hash の `?` より前の対応。会話の画面は空（`#` だけになる）。 */
const SCREEN_PATH = {
  conversation: "",
  character: "character",
  "character-create": "character/new",
  "token-usage": "token-usage",
} as const satisfies Readonly<Record<Screen, string>>

const TURN_PARAM = "turn"
const TURN_ID_PATTERN = /^-?\d+$/

/**
 * hash を読んで、そこから選んだ1つの値を返す。**`select` はプリミティブを返す**
 * （画面だけ読む側は、ターンだけが変わった hash で描き直さずに済む）。
 */
export function useHashRoute<T extends HashSnapshot>(select: (route: HashRoute) => T): T {
  const read = (): T => select(parseHash(window.location.hash))
  // サーバ側で描くことは無いので、サーバ用のスナップショットも同じ読み取りでよい。
  return useSyncExternalStore(subscribeToHash, read, read)
}

/** いまの hash を読む（書き換える直前に、自分が持たない部分を残すため）。 */
export function readHashRoute(): HashRoute {
  return parseHash(window.location.hash)
}

/** hash を書く。`hashchange` が起きて {@link useHashRoute} が読み直す。履歴に1つ積まれる。 */
export function writeHashRoute(route: HashRoute): void {
  window.location.hash = formatHash(route)
}

export function parseHash(hash: string): HashRoute {
  const body = hash.startsWith("#") ? hash.slice(1) : hash
  const queryStart = body.indexOf("?")
  const path = queryStart === -1 ? body : body.slice(0, queryStart)
  const query = queryStart === -1 ? "" : body.slice(queryStart + 1)
  return { screen: screenOf(path), turn: turnOf(new URLSearchParams(query).get(TURN_PARAM)) }
}

/** `<a href>` にそのまま書ける hash（会話の画面・今回に追従なら `#`）。 */
export function formatHash(route: HashRoute): string {
  const path = SCREEN_PATH[route.screen]
  const query = route.turn === "newest" ? "" : `?${TURN_PARAM}=${String(route.turn)}`
  return `#${path}${query}`
}

function subscribeToHash(onStoreChange: () => void): () => void {
  window.addEventListener("hashchange", onStoreChange)
  return () => {
    window.removeEventListener("hashchange", onStoreChange)
  }
}

function screenOf(path: string): Screen {
  return SCREENS.find((screen) => SCREEN_PATH[screen] === path) ?? "conversation"
}

/** `URLSearchParams.get` の `null`（無い）もここで畳む。番号に読めない値は今回に追従する。 */
function turnOf(value: string | null): ViewedTurn {
  if (value === null || !TURN_ID_PATTERN.test(value)) {
    return "newest"
  }
  return Number(value)
}

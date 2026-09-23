// `location.hash` の書き方を決める唯一の場所。**1本の hash を2つの store が読む**
// （出している画面は `stores/screen.tsx`、見ているターンは `stores/turn-selection.tsx`）ので、
// 片方が書くときにもう片方の部分を消さないよう、読み書きはここの {@link HashRoute} を通す。
//
// 形は `#<画面>?pack=<名前>&turn=<番号>`。**画面は `?` の前、ターンは `turn` の値、キャラクター画面で
// 選んでいるパックは `pack` の値**:
//
// - `#`                           会話の画面・今回に追従（リンクの `href` に空文字を書けないので `#`）
// - `#?turn=3`                    会話の画面・通し番号 3 のターンに留める
// - `#character?turn=3`           キャラクター画面（使用中のパック）。ターンは会話の画面へ戻ったときのために運ぶ
// - `#character?pack=tsukumo`     キャラクター画面で `tsukumo` のパックを選んでいる
//
// **パックを `?` の前（`#character/<名前>`）に置かない**のは、`turn` と同じく画面の上に乗る
// 付随情報だから。`pack` を読むのはキャラクター画面のときだけで、ほかの画面へ移ると落ちる
// （戻ると使用中のパックから）。**新しく作るダイアログは URL を持たない**（表示上の状態なので
// 保存しない。開いているかどうかはキャラクター画面の state が持つ。`character-screen.tsx`。
// `docs/screen-design.md` 13.6）。
//
// **今回に追従しているときは `turn` を書かない。** 留めたターンだけが URL に乗るので、何も
// 選んでいない人のリロードは今までどおり今回を出す。

import { useSyncExternalStore } from "react"

const SCREENS = ["conversation", "character", "token-usage"] as const

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

/**
 * キャラクター画面で選んでいるパック（`docs/screen-design.md` 13.6）。`in-use` は使用中のパックを
 * 出す（`pack` が無いとき）。名前が一覧に無いときにどうするかは読む側（`character-screen`）が決める。
 */
export type PackSelection =
  | { readonly kind: "in-use" }
  | { readonly kind: "named"; readonly name: string }

export type HashRoute = {
  readonly screen: Screen
  readonly turn: ViewedTurn
  readonly pack: PackSelection
}

/** hash の値の型。スナップショットが同じ値なら描き直さないよう、プリミティブに限る。 */
type HashSnapshot = string | number

/** 画面と hash の `?` より前の対応。会話の画面は空（`#` だけになる）。 */
const SCREEN_PATH = {
  conversation: "",
  character: "character",
  "token-usage": "token-usage",
} as const satisfies Readonly<Record<Screen, string>>

const TURN_PARAM = "turn"
const PACK_PARAM = "pack"
const IN_USE: PackSelection = { kind: "in-use" }
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
  const params = new URLSearchParams(queryStart === -1 ? "" : body.slice(queryStart + 1))
  const screen = screenOf(path)
  return {
    screen,
    turn: turnOf(params.get(TURN_PARAM)),
    pack: screen === "character" ? packOf(params.get(PACK_PARAM)) : IN_USE,
  }
}

/** `<a href>` にそのまま書ける hash（会話の画面・今回に追従なら `#`）。 */
export function formatHash(route: HashRoute): string {
  const params = new URLSearchParams()
  if (route.screen === "character" && route.pack.kind === "named") {
    params.set(PACK_PARAM, route.pack.name)
  }
  if (route.turn !== "newest") {
    params.set(TURN_PARAM, String(route.turn))
  }
  const query = params.toString()
  return `#${SCREEN_PATH[route.screen]}${query === "" ? "" : `?${query}`}`
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

/** 空の `pack` は「選んでいない」に畳む（パックの名前は空にならない）。 */
function packOf(value: string | null): PackSelection {
  return value === null || value === "" ? IN_USE : { kind: "named", name: value }
}

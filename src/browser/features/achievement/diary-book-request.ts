// 画面をまたいで日記帳の見開き（`hooks/use-diary-book.ts`）を開く一回限りの合図
// （`docs/screen-design.md` 13.10「書き終わりの知らせ」）。見開きの開閉そのもの（`BookState`）は
// `useDiaryBook` に残したまま——`achievement-screen.tsx` は成果の画面を離れるとアンマウントされる
// （`main.tsx` の `OVERLAY_SCREEN`）ので、知らせ（`diary-notice.tsx`。画面のどこからでも常駐する）が
// 「この日を開いて」と呼びかけても、見開きの側がまだ生きているとは限らない。React の木の上で
// 親子になっていない2箇所（入口が常駐させる知らせと、成果の画面の中の見開き）のあいだで合図を
// 運ぶので、Context ではなく `location-hash.ts` と同じ「React の外の小さな store」の形にする
// （`docs/coding-standards.md`「useEffect の代わりに使うもの」の「外部ストアの購読」＝
// `useSyncExternalStore`）。
//
// 呼び手が両方とも `features/achievement/` の中だけなので `stores/` へは上げない
// （`docs/screen-design.md` 13.10「並べるもの」で言う「2つの機能をまたぐ」には当たらない）。

import { useSyncExternalStore } from "react"

/** 「この日を開いて」の1回ぶん。`token` は呼ぶたびに増え、同じ日への2回目の要求も見分けられる。 */
export type DiaryBookOpenRequest = { readonly date: string; readonly token: number }

let request: DiaryBookOpenRequest | undefined
let nextToken = 1
// 見開きが最後に拾った合図の `token`。**成果の画面を離れると見開きはアンマウントされる**ので、
// 拾ったかどうかを部品の state に持つと、画面を開き直すたびに同じ合図でまた開いてしまう。
let handledToken = 0
const listeners = new Set<() => void>()

/** 知らせの「日記帳で開く」が呼ぶ。 */
export function requestDiaryBookOpen(date: string): void {
  request = { date, token: nextToken }
  nextToken += 1
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

function getSnapshot(): DiaryBookOpenRequest | undefined {
  return request
}

/** `useDiaryBook` が読む。まだ一度も呼ばれていなければ `undefined`。 */
export function useDiaryBookOpenRequest(): DiaryBookOpenRequest | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/**
 * まだ見開きが拾っていない合図なら、拾った印を付けて返す（2回目からは `undefined`）。
 * `useDiaryBook` が描画中に呼ぶ（印は React の外にあり、同じ合図に対して何度呼んでも同じ結果に畳む）。
 */
export function takeDiaryBookOpenRequest(
  current: DiaryBookOpenRequest | undefined,
): DiaryBookOpenRequest | undefined {
  if (current === undefined || current.token <= handledToken) {
    return undefined
  }
  handledToken = current.token
  return current
}

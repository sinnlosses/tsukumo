// 画面をまたいで日記帳の見開き（`hooks/use-diary-book.ts`）を開く一回限りの合図
// （`docs/screen-design.md` 13.10「書き終わりの知らせ」）。見開きの開閉そのもの（`BookState`）は
// `useDiaryBook` に残したまま——`achievement.tsx` は成果の画面を離れるとアンマウントされる
// （`components/app/layout.tsx` の `OVERLAY_SCREEN`）ので、知らせ（`diary-notice.tsx`。画面のどこからでも常駐する）が
// 「この日を開いて」と呼びかけても、見開きの側がまだ生きているとは限らない。React の木の上で
// 親子になっていない2箇所のあいだで合図を運ぶので、部品の state ではなく store に持つ。
//
// 呼び手が両方とも `components/page/achievement/` の中だけなので `stores/` へは上げない
// （`docs/screen-design.md` 13.10「並べるもの」で言う「2つの機能をまたぐ」には当たらない）。

import { create } from "zustand"

/** 「この日を開いて」の1回ぶん。`token` は呼ぶたびに増え、同じ日への2回目の要求も見分けられる。 */
export type DiaryBookOpenRequest = { readonly date: string; readonly token: number }

/** 知らせの「日記帳で開く」が呼ぶ。 */
export function requestDiaryBookOpen(date: string): void {
  useDiaryBookOpenRequestStore.setState((state) => ({
    request: { date, token: (state.request?.token ?? 0) + 1 },
  }))
}

/** `useDiaryBook` が読む。まだ一度も呼ばれていなければ `undefined`。 */
export function useDiaryBookOpenRequest(): DiaryBookOpenRequest | undefined {
  return useDiaryBookOpenRequestStore((state) => state.request)
}

/**
 * まだ見開きが拾っていない合図なら、拾った印を付けて返す（2回目からは `undefined`）。
 * `useDiaryBook` が描画中に呼ぶ（印は部品の外にあり、同じ合図に対して何度呼んでも同じ結果に畳む）。
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

type DiaryBookOpenRequestState = {
  readonly request: DiaryBookOpenRequest | undefined
}

const useDiaryBookOpenRequestStore = create<DiaryBookOpenRequestState>()(() => ({
  request: undefined,
}))

// 見開きが最後に拾った合図の `token`。成果の画面を離れると見開きはアンマウントされるので、
// 拾ったかどうかを部品の state に持つと、画面を開き直すたびに同じ合図でまた開いてしまう。
// store に置かないのは、描画中に書き換えるので購読させないため。
let handledToken = 0

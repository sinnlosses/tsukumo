// 日記帳の右ページ（`../diary-book.tsx`）の縦書きの本文を、ページに収まるまで縮める
// （`docs/screen-design.md` 13.10「日記帳の見開き」）。字の数からは見積もらず、描いた本文が
// 横にはみ出しているか（`scrollWidth > clientWidth`）を測って決める——書体・窓の幅・段落の数で
// 1列に入る字の数が変わるので、見積もりは黙って外れる。
//
// 縮める量はページの `--diary-scale` に書く。字の大きさ・罫の間隔・右の余白はどれもこの値を
// 掛けているので（`achievement.module.css` の `.diary-book-right`）、縮めても本文の列は罫に
// 揃ったまま。`MIN_SCALE` まで縮めても収まらないときは、そこで止めて本文を横に送らせる。

import { useLayoutEffect, type RefObject } from "react"

const SCALE_PROPERTY = "--diary-scale"
const MIN_SCALE = 0.6
const SCALE_STEP = 0.05

/**
 * `pageRef` の `--diary-scale` を、`bodyRef` の本文が横にはみ出さない最大の値にする。
 * 本文が入れ替わる（別の日・書き足し）か、ページか段落の大きさが変わるたびに測り直す。
 * `bodyRef` の要素は日を送っても作り直されない前提（`diary-book.tsx` は書いた日も白紙の日も
 * 同じ位置の `<div>` に描く）。
 */
export function useFitDiaryPage(
  pageRef: RefObject<HTMLElement | null>,
  bodyRef: RefObject<HTMLElement | null>,
): void {
  // React の外（DOM の style）への書き込みと、大きさ・中身の変化の購読
  // （docs/coding-standards.md「React」の4類型）。`useLayoutEffect` でなければならない——
  // `useEffect` だと縮める前の本文が1フレームだけはみ出して見える。
  useLayoutEffect(() => {
    const page = pageRef.current
    const body = bodyRef.current
    if (page === null || body === null) {
      return undefined
    }

    const fit = (): void => {
      let scale = 1
      page.style.setProperty(SCALE_PROPERTY, String(scale))
      while (body.scrollWidth > body.clientWidth + 1 && scale - SCALE_STEP >= MIN_SCALE) {
        scale = Math.round((scale - SCALE_STEP) * 100) / 100
        page.style.setProperty(SCALE_PROPERTY, String(scale))
      }
    }

    // ページ（窓の幅が変わる）と、本文の段落（書体を読み終えると列の数が変わる）の大きさを
    // 見張る。測り終えた大きさは前回と同じなので、`fit` の中で縮めたことでは通知が続かない。
    const resizeObserver = new ResizeObserver(fit)
    const observeSizes = (): void => {
      resizeObserver.disconnect()
      resizeObserver.observe(page)
      for (const paragraph of Array.from(body.children)) {
        resizeObserver.observe(paragraph)
      }
    }
    // 本文の中身が入れ替わったら、段落を見張り直して測り直す。
    const mutationObserver = new MutationObserver(() => {
      observeSizes()
      fit()
    })
    mutationObserver.observe(body, { childList: true, subtree: true, characterData: true })

    observeSizes()
    fit()
    return () => {
      mutationObserver.disconnect()
      resizeObserver.disconnect()
      page.style.removeProperty(SCALE_PROPERTY)
    }
  }, [pageRef, bodyRef])
}

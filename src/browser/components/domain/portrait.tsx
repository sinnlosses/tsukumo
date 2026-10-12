// 立ち絵1件（<Portrait>）。
// SVG もラスタも `<img>` で出す。素材は `/character/<pack>/<file>` から取りに行くだけ。
//
// `expression` は表情の差し替えにだけ使う。
// `motion` は立ち絵の動きを `data-motion` 属性で `portrait.module.css` に渡す。
// 動きを決めるのは呼び出し側で、ここは受け取った値を属性に渡すだけで、動き自体は作らない。
//
// どこに・どれだけの大きさで置くかは呼び出し側（`className`）で、領域ごとに違う。
// ここが持つのは中身の収め方と動きだけ。

import clsx from "clsx"
import { useEffect, type ReactElement } from "react"

import type { Expression } from "../../../shared/character-pack/expression.ts"
import type { PortraitMotion } from "../../../shared/session/portrait-motion.ts"
import styles from "./portrait.module.css"

export type PortraitProps = {
  /** `/character/<pack>/<file>` の URL。 */
  readonly url: string
  readonly altText: string
  readonly expression: Expression
  /**
   * いまの動き（`resolvePortraitMotion`）。
   * 動かさない置き方もあるので `undefined` を許す。
   * そのときは `data-motion` が付かず、`portrait.module.css` の動きの規則はどれも当たらない。
   */
  readonly motion: PortraitMotion | undefined
  /** 置き方（余白・高さ・幅の上限）を足す class 名。足すものが無ければ `undefined`。 */
  readonly className: string | undefined
}

/**
 * キャラクターの立ち絵を表情の数だけ先に読んでおく。
 * 仕事 / 雑談を切り替えると立ち絵は別の領域で新しくマウントされ、表情も切り替え前と違うことがある。
 * 読んでいない絵だと、読み終わるまで立ち絵の場所が空いたまま移り変わりが終わり、そのあとで絵がいきなり現れる（実測: 初めての表情で約250ms）。
 *
 * `Image` に読ませ、キャラクターが変わるまで参照を持ち続ける。
 * `/character/<pack>/<file>` は `no-store` で配るので、参照が切れた絵はブラウザが読み直すことがある。
 */
export function usePortraitPreload(portraits: Readonly<Record<string, string>> | undefined): void {
  useEffect(() => {
    if (portraits === undefined) {
      return undefined
    }
    const images = [...new Set(Object.values(portraits))].map((url) => {
      const image = new Image()
      image.src = url
      return image
    })
    // 前のキャラクターの絵は読みかけでも止めて手放す（`src` を空にすると読み込みが打ち切られる）。
    return () => {
      for (const image of images) {
        image.src = ""
      }
    }
  }, [portraits])
}

export function Portrait(props: PortraitProps): ReactElement {
  return (
    <div
      className={clsx(styles["portrait"], props.className)}
      role="img"
      aria-label={props.altText}
      data-expression={props.expression}
      data-motion={props.motion}
    >
      <img className={styles["portrait-image"]} src={props.url} alt={props.altText} />
    </div>
  )
}

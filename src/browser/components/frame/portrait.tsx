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
import type { KeyboardEvent, ReactElement } from "react"
import { unique } from "remeda"

import type { Expression } from "../../../shared/character-pack/expression.ts"
import type { PortraitMotion } from "../../domain/portrait-motion.ts"
import { useExternalSync } from "../../hooks/use-external-sync.ts"
import { isActivationKey } from "../../utils/activation-key.ts"
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
  readonly motion?: PortraitMotion
  /** 置き方（余白・高さ・幅の上限）を足す class 名。足すものが無ければ `undefined`。 */
  readonly className?: string
  /**
   * 押せる立ち絵にするときの、読み上げの名前と押したときの処理。
   * 渡すと `role="button"`・`tabIndex=0` になり、Enter と Space でも押せる。押せない置き方は `undefined`。
   */
  readonly press?: PortraitPress
  /** 聞く姿勢を取るか（`data-listening`）。姿勢の形は CSS が持つ。 */
  readonly listening?: boolean
  /** 立ち絵の画に重ね、立ち絵の動きに付いて動く要素。重ねない置き方は `undefined`。 */
  readonly overlay?: ReactElement
}

export type PortraitPress = {
  readonly label: string
  readonly onPress: () => void
}

/**
 * キャラクターの立ち絵を表情の数だけ先に読んでおく。
 * 仕事 / 雑談を切り替えると立ち絵は別の領域で新しくマウントされ、表情も切り替え前と違うことがある。
 * 読んでいない絵だと、読み終わるまで立ち絵の場所が空いたまま移り変わりが終わり、そのあとで絵がいきなり現れる（実測: 初めての表情で約250ms）。
 *
 * `Image` に読ませ、キャラクターが変わるまで参照を持ち続ける。
 * `/character/<pack>/<file>` は `no-store` で配るので、参照が切れた絵はブラウザが読み直すことがある。
 */
export function usePortraitPreload(portraits?: Readonly<Record<string, string>>): void {
  useExternalSync(() => {
    if (portraits === undefined) {
      return undefined
    }
    const images = unique(Object.values(portraits)).map((url) => {
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
  const { press } = props
  const pressProps =
    press === undefined
      ? { role: "img", "aria-label": props.altText }
      : {
          role: "button",
          tabIndex: 0,
          "aria-label": press.label,
          onClick: press.onPress,
          onKeyDown: (event: KeyboardEvent) => {
            if (!isActivationKey(event.key)) {
              return
            }
            // Space はページを1画面送る既定の動作を持つので、押したことにする側で止める。
            event.preventDefault()
            press.onPress()
          },
        }
  return (
    <div
      className={clsx(styles["portrait"], props.className)}
      {...pressProps}
      data-expression={props.expression}
      data-motion={props.motion}
      {...(props.listening === true ? { "data-listening": "" } : {})}
    >
      <img className={styles["portrait-image"]} src={props.url} alt={props.altText} />
      {props.overlay}
    </div>
  )
}

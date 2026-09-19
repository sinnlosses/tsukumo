// 立ち絵1件（<Portrait>。docs/design.md 6.1・6.5 / 13.6）。**キャラビューとキャラクター画面の
// 立ち絵の並びの2つが読む**ので `components/`（機能の語彙を持たない部品）に置く（2章
// 「上げる引き金」）。**動きを決めるのは呼び出し側**で、ここは受け取った値を属性に渡すだけ。**SVG は `fetch` して中身をそのまま
// インライン**にし（差し色の CSS 変数 `--outfit-accent` を効かせるため。`<img>` で読み込むと
// 独立した文書扱いになり届かない。`characters/README.md` の実測）、ラスタは `<img>` で出す
// （docs/requirements.md 4.4）。
// 素材は `/character/<file>` から取りに行くだけで、`SessionState` には URL しか乗らない
// （docs/design.md 4.2・5章）。
//
// **`expression` / `outfit` は表情・衣装の差し替えにだけ使う**（立ち絵そのものの差し替えで
// 表す。docs/requirements.md 4.3）。**`motion` が立ち絵の動き**（呼吸・待っている間の移動・
// 完了の反応・失敗でびくっ）を `data-motion` 属性で CSS 側（`ui/style/character.css`）に渡す。
// 「1枚の矩形」として位置・大きさ・傾き・上下・不透明度だけを動かす割り切りなので、
// ここでは属性を渡すだけで動き自体は作らない（docs/design.md 6.5）。

import { useEffect, useState, type CSSProperties, type ReactElement } from "react"

import { classifyPortraitFile } from "../../protocol/character.ts"
import { type Expression, type Outfit } from "../../protocol/expression.ts"
import { type PortraitMotion } from "../../protocol/portrait-motion.ts"

export type PortraitProps = {
  /** `/character/<file>` の URL。 */
  readonly url: string
  /** CSS 変数 `--outfit-accent` に渡す差し色。インライン SVG のときだけ見た目に効く。 */
  readonly accent: string | undefined
  readonly altText: string
  readonly expression: Expression
  readonly outfit: Outfit
  /**
   * いまの動き。決めるのは呼び出し側（`features/character-view/character-view.tsx` の
   * `resolvePortraitMotion`）。**動かさない置き方もある**ので `undefined` を許す
   * （キャラクター画面の立ち絵の並び。13.6）。そのときは `data-motion` が付かず、
   * `character.css` の動きの規則はどれも当たらない。
   */
  readonly motion: PortraitMotion | undefined
}

/**
 * SVG の中身を `fetch` する。URL が変わるたびに読み直し、コンポーネントが外れた・URL が
 * 変わったあとの古い応答は捨てる。読めない・失敗したときは undefined のまま
 * （立ち絵が一瞬出ないだけで、落ちない）。
 */
function useSvgMarkup(url: string | undefined): string | undefined {
  const [markup, setMarkup] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (url === undefined) {
      setMarkup(undefined)
      return undefined
    }

    let cancelled = false
    setMarkup(undefined)
    fetch(url)
      .then((response) => (response.ok ? response.text() : undefined))
      .then((text) => {
        if (!cancelled) {
          setMarkup(text)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMarkup(undefined)
        }
      })
    return () => {
      cancelled = true
    }
  }, [url])

  return markup
}

/**
 * `style` に渡す形。React の `CSSProperties` は CSS カスタムプロパティの索引シグネチャを
 * 持たないので、キャストで迂回せずカスタムプロパティを足した型で受ける
 * （docs/coding-standards.md「型を迂回するキャストを使わない」）。
 */
type PortraitStyle = CSSProperties & { readonly "--outfit-accent": string }

export function Portrait(props: PortraitProps): ReactElement {
  const kind = classifyPortraitFile(props.url)
  const svgMarkup = useSvgMarkup(kind === "svg" ? props.url : undefined)
  const style: PortraitStyle | undefined =
    props.accent === undefined ? undefined : { "--outfit-accent": props.accent }

  const wrapperProps = {
    className: "portrait",
    style,
    role: "img",
    "aria-label": props.altText,
    "data-expression": props.expression,
    "data-outfit": props.outfit,
    "data-motion": props.motion,
  }

  // SVG はエスケープせずファイルの中身をそのまま差し込む（インライン埋め込みそのものが目的
  // のため）。読み込みが終わっていない・失敗したときは空のまま
  // （吹き出しだけで成立させる。落ちない）。**`dangerouslySetInnerHTML` と `children` は
  // 同じ要素に同時に渡さない**（React が警告する）ので、SVG のときは別の `return` にする。
  if (kind === "svg") {
    return (
      <div
        {...wrapperProps}
        dangerouslySetInnerHTML={svgMarkup === undefined ? undefined : { __html: svgMarkup }}
      />
    )
  }

  return (
    <div {...wrapperProps}>
      {kind === "raster" && <img className="portrait-image" src={props.url} alt={props.altText} />}
    </div>
  )
}

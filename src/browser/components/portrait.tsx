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
// 完了の反応・失敗でびくっ）を `data-motion` 属性で CSS 側（`portrait.module.css`）に渡す。
//
// **どこに・どれだけの大きさで置くかは呼び出し側**（`className`）。ここが持つのは中身の
// 収め方と動きだけで、置き方は領域ごとに違う（キャラビューは床に立たせ、キャラクター画面の
// 並びは固定の高さで畳に並べる）。
// 「1枚の矩形」として位置・大きさ・傾き・上下・不透明度だけを動かす割り切りなので、
// ここでは属性を渡すだけで動き自体は作らない（docs/design.md 6.5）。

import { useQuery } from "@tanstack/react-query"
import { type CSSProperties, type ReactElement } from "react"

import { classifyPortraitFile } from "../../shared/character-asset.ts"
import { type Expression, type Outfit } from "../../shared/expression.ts"
import { type PortraitMotion } from "../../shared/portrait-motion.ts"
import styles from "./portrait.module.css"

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
  /**
   * 置き方（余白・高さ・幅の上限）を足す class 名。呼び出し側の `*.module.css` のもので、
   * **立ち絵自身の見た目は持たない**。足すものが無ければ `undefined`。
   */
  readonly className: string | undefined
}

/**
 * SVG の中身を `fetch` する（TanStack Query）。**`/character/<file>` の URL は
 * パックの名前と素材の版を問い合わせ文字列に含む**（`characterAssetCacheKey`）ので、立ち絵や
 * 差し色を変えると URL 自体が変わる。`queryKey` を URL だけにすれば、中身が変わったときは
 * 別のキャッシュ行になり、**同じ URL の中身はセッション中変わらない**ので取り直す理由が無い
 * （`staleTime` / `gcTime` を `Infinity` にする）。
 *
 * **読めなかったときは `undefined` を返す。** 読み込みが終わっていないときと同じ「いまの URL の
 * 中身が無い」になり、呼び出し側の描き分けも同じ（立ち絵が出ないだけで、落ちない）。
 */
function useSvgMarkup(url: string | undefined): string | undefined {
  const { data } = useQuery({
    queryKey: [url] as const,
    queryFn: async ({ queryKey: [target] }) => {
      if (target === undefined) {
        return undefined
      }
      const response = await fetch(target)
      return response.ok ? await response.text() : undefined
    },
    enabled: url !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  return data
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
    className:
      props.className === undefined
        ? styles["portrait"]
        : `${styles["portrait"]} ${props.className}`,
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
      {kind === "raster" && (
        <img className={styles["portrait-image"]} src={props.url} alt={props.altText} />
      )}
    </div>
  )
}

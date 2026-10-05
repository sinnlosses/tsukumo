// 立ち絵1件（<Portrait>）。
// SVG は `fetch` して `sanitizeSvg` で削ぎ落とした中身をインラインにし、ラスタは `<img>` で出す。
// SVG を `<img>` で読み込むと独立した文書扱いになり、差し色の CSS 変数 `--outfit-accent` が届かない（`characters/README.md` の実測）。
// 素材は `/character/<pack>/<file>` から取りに行くだけ。
//
// `expression` / `outfit` は表情・衣装の差し替えにだけ使う。
// `motion` は立ち絵の動きを `data-motion` 属性で `portrait.module.css` に渡す。
// 動きを決めるのは呼び出し側で、ここは受け取った値を属性に渡すだけで、動き自体は作らない。
//
// どこに・どれだけの大きさで置くかは呼び出し側（`className`）で、領域ごとに違う。
// ここが持つのは中身の収め方と動きだけ。

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, type CSSProperties, type ReactElement } from "react"

import { classifyPortraitFile } from "../../../shared/character-pack/character-asset.ts"
import type { Expression, Outfit } from "../../../shared/character-pack/expression.ts"
import type { PortraitMotion } from "../../../shared/session/portrait-motion.ts"
import { sanitizeSvg } from "../../utils/sanitize-svg.ts"
import styles from "./portrait.module.css"

export type PortraitProps = {
  /** `/character/<pack>/<file>` の URL。 */
  readonly url: string
  /** CSS 変数 `--outfit-accent` に渡す差し色。インライン SVG のときだけ見た目に効く。 */
  readonly accent: string | undefined
  readonly altText: string
  readonly expression: Expression
  readonly outfit: Outfit
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
 * SVG の中身を `fetch` する（TanStack Query）。
 * `/character/<pack>/<file>` の URL はパックの名前を経路に、素材の版を問い合わせ文字列に含む（`characterAssetPath`）ので、立ち絵や差し色を変えると URL 自体が変わる。
 * だから `queryKey` は URL だけでよく、同じ URL の中身はセッション中変わらないので取り直さない（`staleTime` / `gcTime` を `Infinity` にする）。
 *
 * 読めなかったときは、読み込みが終わっていないときと同じ `undefined` を返す（立ち絵が出ないだけで、落ちない）。
 */
function useSvgMarkup(url: string | undefined): string | undefined {
  const { data } = useQuery({
    queryKey: [url] as const,
    queryFn: async ({ queryKey: [target] }) =>
      target === undefined ? undefined : await fetchSvgMarkup(target),
    enabled: url !== undefined,
    staleTime: Infinity,
    gcTime: Infinity,
  })

  return data
}

/**
 * キャラクターの立ち絵を表情の数だけ先に読んでおく。
 * 仕事 / 雑談を切り替えると立ち絵は別の領域で新しくマウントされ、表情も切り替え前と違うことがある。
 * 読んでいない絵だと、読み終わるまで立ち絵の場所が空いたまま移り変わりが終わり、そのあとで絵がいきなり現れる（実測: 初めての表情で約250ms）。
 *
 * SVG は {@link useSvgMarkup} と同じキャッシュ行へ入れ、ラスタは `Image` に読ませてキャラクターが変わるまで参照を持ち続ける。
 * `/character/<pack>/<file>` は `no-store` で配るので、参照が切れた絵はブラウザが読み直すことがある。
 */
export function usePortraitPreload(portraits: Readonly<Record<string, string>> | undefined): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (portraits === undefined) {
      return undefined
    }
    const urls = [...new Set(Object.values(portraits))]
    const images = urls
      .filter((url) => classifyPortraitFile(url) === "raster")
      .map((url) => {
        const image = new Image()
        image.src = url
        return image
      })
    for (const url of urls.filter((candidate) => classifyPortraitFile(candidate) === "svg")) {
      void queryClient.prefetchQuery({
        queryKey: [url] as const,
        queryFn: () => fetchSvgMarkup(url),
        staleTime: Infinity,
        gcTime: Infinity,
      })
    }
    // 前のキャラクターの絵は読みかけでも止めて手放す（`src` を空にすると読み込みが打ち切られる）。
    return () => {
      for (const image of images) {
        image.src = ""
      }
    }
  }, [portraits, queryClient])
}

async function fetchSvgMarkup(url: string): Promise<string | undefined> {
  const response = await fetch(url)
  return response.ok ? sanitizeSvg(await response.text()) : undefined
}

/** React の `CSSProperties` は CSS カスタムプロパティの索引シグネチャを持たないので、足した型で受ける。 */
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

  // SVG は削ぎ落とした中身をエスケープせずに差し込む（インライン埋め込みそのものが目的）。
  // 読み込みが終わっていない・失敗した・SVG として読めなかったときは空のまま。
  // `dangerouslySetInnerHTML` と `children` は同じ要素に同時に渡せない（React が警告する）ので、SVG のときは別の `return` にする。
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

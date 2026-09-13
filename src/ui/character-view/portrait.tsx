// 立ち絵1件（<Portrait>。docs/design.md 6.1・6.5）。**SVG は `fetch` して中身をそのまま
// インライン**にし（差し色の CSS 変数 `--outfit-accent` を効かせるため。`<img>` で読み込むと
// 独立した文書扱いになり届かない。`characters/README.md` の実測）、ラスタは `<img>` で出す
// （docs/requirements.md 4.4）。
// 素材は `/character/<file>` から取りに行くだけで、`SessionState` には URL しか乗らない
// （docs/design.md 4.2・5章）。
//
// **`expression` / `outfit` は、表情の遷移の余地（6.5）として受け取るだけ**で、ここでは
// 動きを作らない（`docs/requirements.md` 4.3。立ち絵は動くが話さない、の決定を待つ）。

import { useEffect, useState, type CSSProperties, type ReactElement } from "react"

import { classifyPortraitFile } from "../../protocol/character.ts"
import { type Expression, type Outfit } from "../../protocol/expression.ts"

export type PortraitProps = {
  /** `/character/<file>` の URL。 */
  readonly url: string
  /** CSS 変数 `--outfit-accent` に渡す差し色。インライン SVG のときだけ見た目に効く。 */
  readonly accent: string | undefined
  readonly altText: string
  /** 表情の遷移の余地（6.5）として受け取るだけで、ここでは使わない。 */
  readonly expression: Expression
  /** 同上（衣装の切り替えの余地）。 */
  readonly outfit: Outfit
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

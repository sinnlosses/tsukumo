// パックのキャラクターの顔を丸く切り抜いて出す部品。
//
// 押せない絵で、表情や衣装では変わらない1枚（`CharacterInfo.face`）。
// 定義に `face` が無いパックでは何も描かない。
// 空の丸も頭文字の丸も出さず、`mini` や立ち絵から切り抜いて代わりにすることもしない。
//
// 領域固有の見た目は持たない。大きさ・丸の地の色は呼び出し側が `className` で決める。
//
// SVG も `<img>` で出し、`Portrait` のインライン埋め込みは使わない。
// 顔は表情でも衣装でも変わらない1枚なので、差し色 `--outfit-accent` を効かせず、SVG が内蔵する既定色のまま出ればよい。

import type { ReactElement } from "react"

export type CharacterFaceProps = {
  /** `/character/<pack>/<file>` の URL。無ければ顔を出さない。 */
  readonly url: string | undefined
  /** 読み上げに渡す名前（パックの `name`）。無ければ空文字。 */
  readonly alt: string
  readonly className: string
}

export function CharacterFace(props: CharacterFaceProps): ReactElement | null {
  if (props.url === undefined) {
    return null
  }

  return <img className={props.className} src={props.url} alt={props.alt} />
}

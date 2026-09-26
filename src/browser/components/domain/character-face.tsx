// パックのキャラクターの顔（`docs/screen-design.md` 13.9「顔」）を丸く切り抜いて出す部品。帯
// （`components/domain/screen-nav/`）とサイドバーの「セッション情報」（`components/domain/sidebar/`）の両方が
// 読むので、機能どうしの import を増やさず `browser/components/domain/`（tsukumo の語彙を
// 持つ部品）に置く（`docs/design.md` 2章「機能の中を分ける」——`<Portrait>` を
// `components/domain/portrait.tsx` へ上げたのと同じ引き金）。
//
// 押せない絵で、表情や衣装では変わらない1枚（`CharacterInfo.face`）。定義に `face` が無い
// パックでは何も描かない（`null` を返す。空の丸も頭文字の丸も出さない。`mini` や立ち絵から
// 切り抜いて代わりにすることもしない）。
//
// 領域固有の見た目は持たない（`components/ui/select/select.tsx` と同じ作法）。大きさ・丸の地の色は
// 呼び出し側が `className` で決める（帯は帯の高さに合わせ、サイドバーは選択欄の行の高さに合わせる）。
//
// SVG も `<img>` で出す（差し色 `--outfit-accent` を効かせるための `Portrait` のインライン埋め込みは
// 使わない。顔は表情でも衣装でも変わらない1枚なので、SVG が内蔵する既定色のまま出ればよい）。

import { type ReactElement } from "react"

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

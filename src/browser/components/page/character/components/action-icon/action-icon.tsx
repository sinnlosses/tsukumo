// キャラクター画面の口に添える線のアイコン（差し替える・消す・足す）。字を持たない口
// （カードに乗せたとき出る2つ）は読み上げの名前を口の側に持つので、ここは絵だけ。
// 線の色は読み手の `currentColor`（色は `character.module.css` が決める）。

import { ArrowLeftRight, Pencil, Plus, Trash2, Upload } from "lucide-react"
import { type ReactElement } from "react"

/** 差し替える（上向きの矢印と下の線）。 */
export function UploadIcon(): ReactElement {
  return <Upload {...ICON_ATTRIBUTES} />
}

/** 消す（くず入れ）。 */
export function TrashIcon(): ReactElement {
  return <Trash2 {...ICON_ATTRIBUTES} />
}

/** 足す・作る（十字）。 */
export function PlusIcon(): ReactElement {
  return <Plus {...ICON_ATTRIBUTES} />
}

/** 切り替える（左右の矢印）。 */
export function SwitchIcon(): ReactElement {
  return <ArrowLeftRight {...ICON_ATTRIBUTES} />
}

/** 名乗りを変える（鉛筆）。 */
export function PencilIcon(): ReactElement {
  return <Pencil {...ICON_ATTRIBUTES} />
}

const ICON_ATTRIBUTES = { size: 15, strokeWidth: 1.9 } as const

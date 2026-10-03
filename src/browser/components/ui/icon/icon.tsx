// 操作の口に添える線のアイコン。絵は lucide-react で、大きさと線の太さをここで揃える。
// 読み上げの名前は口の側が持つので、ここは絵だけ。線の色は読み手の `currentColor`。

import {
  ArrowLeftRight,
  ArrowRight,
  List,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react"
import type { ReactElement } from "react"

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

/** 取り直す（円を巡る矢印）。 */
export function RefreshIcon(): ReactElement {
  return <RefreshCw {...ICON_ATTRIBUTES} />
}

/** 始める・進む（右向きの矢印）。 */
export function ArrowRightIcon(): ReactElement {
  return <ArrowRight {...ICON_ATTRIBUTES} />
}

/** 一覧から選ぶ（行の並び）。 */
export function ListIcon(): ReactElement {
  return <List {...ICON_ATTRIBUTES} />
}

/** 前のやり取りへ戻る（左回りの矢印）。 */
export function HistoryIcon(): ReactElement {
  return <RotateCcw {...ICON_ATTRIBUTES} />
}

const ICON_ATTRIBUTES = { size: 15, strokeWidth: 1.9 } as const

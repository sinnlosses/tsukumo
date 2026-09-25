// キャラクター画面の口に添える線のアイコン（差し替える・消す・足す）。**字を持たない口
// （カードに乗せたとき出る2つ）は読み上げの名前を口の側に持つ**ので、ここは `aria-hidden` の
// 絵だけ。線の色は読み手の `currentColor`（色は `character.module.css` が決める）。

import { type ReactElement } from "react"

/** 差し替える（上向きの矢印と下の線）。 */
export function UploadIcon(): ReactElement {
  return (
    <svg {...ICON_ATTRIBUTES}>
      <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
    </svg>
  )
}

/** 消す（くず入れ）。 */
export function TrashIcon(): ReactElement {
  return (
    <svg {...ICON_ATTRIBUTES}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
    </svg>
  )
}

/** 足す・作る（十字）。 */
export function PlusIcon(): ReactElement {
  return (
    <svg {...ICON_ATTRIBUTES}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

/** 切り替える（左右の矢印）。 */
export function SwitchIcon(): ReactElement {
  return (
    <svg {...ICON_ATTRIBUTES}>
      <path d="M7 7h13l-4-4M17 17H4l4 4" />
    </svg>
  )
}

/** 名乗りを変える（鉛筆）。 */
export function PencilIcon(): ReactElement {
  return (
    <svg {...ICON_ATTRIBUTES}>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" />
    </svg>
  )
}

const ICON_ATTRIBUTES = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const

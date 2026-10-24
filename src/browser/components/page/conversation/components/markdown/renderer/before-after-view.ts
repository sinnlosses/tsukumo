// 両側が画像の前後の塊の見せ方（並べる・切り替え）を `localStorage` に持つ。
// 利用者の端末ごとの好みなので、サーバの状態には置かない。
// 読めない・欠けている値は並べるへ畳む。

import { z } from "zod"

import { localPreference, RAW_STRING_CODEC } from "../../../../../../utils/local-preference.ts"

export type BeforeAfterView = "side" | "switch"

const preference = localPreference(
  "tsukumo-before-after-view:v1",
  z.enum(["side", "switch"]),
  "side",
  RAW_STRING_CODEC,
)

export const loadBeforeAfterView: () => BeforeAfterView = preference.load

export const saveBeforeAfterView: (view: BeforeAfterView) => void = preference.save

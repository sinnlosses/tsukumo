// 両側が画像の前後の部品の見せ方（並べる・切り替え・重ねる）を `localStorage` に持つ。
// 利用者の端末ごとの好みなので、サーバの状態には置かない。
// 読めない・欠けている値は並べるへ畳む。

import { z } from "zod"

import { localPreference, RAW_STRING_CODEC } from "../../../../../../utils/local-preference.ts"

export type CompareView = "side" | "switch" | "overlay"

const preference = localPreference(
  "tsukumo-compare-view:v1",
  z.enum(["side", "switch", "overlay"]),
  "side",
  RAW_STRING_CODEC,
)

export const loadCompareView: () => CompareView = preference.load

export const saveCompareView: (view: CompareView) => void = preference.save

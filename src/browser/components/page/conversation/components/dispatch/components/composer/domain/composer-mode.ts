// 入力欄の面をどちらで出すか（素の `<textarea>` か、マークダウンエディタか）を `localStorage` に持つ。
// 利用者の端末ごとの好みなので、サーバの状態には置かない。
// 読めない・欠けている値は `<textarea>` へ畳む。

import { z } from "zod"

import {
  localPreference,
  RAW_STRING_CODEC,
} from "../../../../../../../../utils/local-preference.ts"

export type ComposerMode = "plain" | "markdown"

const preference = localPreference(
  "tsukumo-composer-mode:v1",
  z.enum(["plain", "markdown"]),
  "plain",
  RAW_STRING_CODEC,
)

export const loadComposerMode: () => ComposerMode = preference.load

export const saveComposerMode: (mode: ComposerMode) => void = preference.save

// 旧い器と新しい器「舞台と紙」の切り替えの印。読み込んだときに1回だけ読み、`<html>` の `data-shell` に立てる。
// URL の検索引数 `shell` は端末ごとの好みへ書いてから読むので、引数を外して読み直しても保たれる。

import { z } from "zod"

import { localPreference, RAW_STRING_CODEC } from "../utils/local-preference.ts"

const shellSchema = z.enum(["classic", "stage"])

type Shell = z.infer<typeof shellSchema>

const shellPreference = localPreference<Shell>(
  "tsukumo-shell:v1",
  shellSchema,
  "classic",
  RAW_STRING_CODEC,
)

export function applyShellMark(search: string, root: HTMLElement): void {
  const requested = shellSchema.safeParse(new URLSearchParams(search).get("shell"))
  if (requested.success) {
    shellPreference.save(requested.data)
  }
  root.dataset["shell"] = shellPreference.load()
}

// 旧い器と新しい器「舞台と紙」の切り替えの印。読み込んだときに1回だけ読み、`<html>` の `data-shell` に立てる。
// URL の検索引数 `shell` は端末ごとの好みへ書いてから読むので、引数を外して読み直しても保たれる。

import { z } from "zod"

import { localPreference, RAW_STRING_CODEC } from "../utils/local-preference.ts"

const shellSchema = z.enum(["classic", "stage"])

export type Shell = z.infer<typeof shellSchema>

const SHELL_PARAM = "shell"

const shellPreference = localPreference<Shell>(
  "tsukumo-shell:v1",
  shellSchema,
  "classic",
  RAW_STRING_CODEC,
)

export function applyShellMark(search: string, root: HTMLElement): void {
  const requested = shellSchema.safeParse(new URLSearchParams(search).get(SHELL_PARAM))
  if (requested.success) {
    shellPreference.save(requested.data)
  }
  root.dataset["shell"] = shellPreference.load()
}

/** 読み込んだときに `applyShellMark` が立てた印。立っていなければ旧い器。 */
export function shownShell(root: HTMLElement): Shell {
  const parsed = shellSchema.safeParse(root.dataset["shell"])
  return parsed.success ? parsed.data : "classic"
}

/**
 * 印を書き換えて読み込み直す。印は読み込んだときにしか読まないため。
 * URL に `shell` の引数が残っていると読み込み直したときに書き戻されるので、外してから読み込み直す。
 */
export function switchShell(shell: Shell): void {
  shellPreference.save(shell)
  const url = new URL(window.location.href)
  url.searchParams.delete(SHELL_PARAM)
  window.history.replaceState(window.history.state, "", url)
  window.location.reload()
}

export function isShell(value: string): value is Shell {
  return shellSchema.safeParse(value).success
}

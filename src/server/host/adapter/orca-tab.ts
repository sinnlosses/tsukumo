// `orca tab list` / `orca tab create` の `--json` 出力から、タブの形だけを取り出す。

import { isPlainObject } from "remeda"

/** `orca tab list` に出てくるタブ1つ分。 */
export type OrcaTab = {
  readonly pageId: string
  readonly url: string
  readonly title: string
}

/** `orca tab list --json` の戻り値から、必要な3つのフィールドが揃ったタブだけを採る。 */
export function parseOrcaTabList(value: unknown): readonly OrcaTab[] {
  if (!isPlainObject(value) || !isPlainObject(value.result) || !Array.isArray(value.result.tabs)) {
    return []
  }

  const tabs: readonly unknown[] = value.result.tabs
  return tabs.flatMap((tab) => {
    if (
      isPlainObject(tab) &&
      typeof tab.browserPageId === "string" &&
      typeof tab.url === "string" &&
      typeof tab.title === "string"
    ) {
      return [{ pageId: tab.browserPageId, url: tab.url, title: tab.title }]
    }
    return []
  })
}

/** `orca tab create --json` の戻り値から、作ったタブのページIDを取り出す。 */
export function parseOrcaCreatedPageId(value: unknown): string | undefined {
  if (!isPlainObject(value) || !isPlainObject(value.result)) {
    return undefined
  }
  const pageId = value.result.browserPageId
  return typeof pageId === "string" ? pageId : undefined
}

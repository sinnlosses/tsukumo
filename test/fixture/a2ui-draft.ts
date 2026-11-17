// テストが共有する、`a2ui` の版の `report` の草稿の組み立て。

import {
  type DraftSource,
  mainViewDraftOf,
} from "../../src/browser/domain/main-view/a2ui-draft-view.ts"
import type {
  A2uiReportComponent,
  A2uiWrittenComponent,
} from "../../src/shared/report/a2ui-report-catalog.ts"
import type { MainViewDraft } from "../../src/shared/session/main-view-shape.ts"

/** 引数をいま書いている途中の草稿の出どころ。 */
export const WRITING_DRAFT = {
  writing: true,
  imageSource: { kind: "pending" },
} as const satisfies DraftSource

/** 書き終えて保留している草稿の出どころ（置き場に置いていない本文）。 */
export const SETTLED_DRAFT = {
  writing: false,
  imageSource: { kind: "none" },
} as const satisfies DraftSource

/** 部品を描く草稿（根の `Report` が届いた草稿）。 */
export type PartsDraft = Extract<MainViewDraft, { readonly kind: "parts" }>

/** 根のある一覧から、部品を描く草稿を作る。根が無い一覧は投げる。 */
export function partsDraftOf(
  toolUseId: string,
  components: readonly A2uiReportComponent[],
  source: DraftSource,
  written: readonly A2uiWrittenComponent[] = [],
): PartsDraft {
  const draft = mainViewDraftOf(toolUseId, components, written, source)
  if (draft?.kind !== "parts") {
    throw new Error("根のある一覧から草稿が作れなかった")
  }
  return draft
}

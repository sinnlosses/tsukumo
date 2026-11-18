// 最終レポートの「HTML で保存」のロジック。
// 押した時点の本文の根の写しを作って送り、結果（保存した・できなかった）を知らせの1行の元として持つ。
// 結果は × で消すまで残る。

import { useState } from "react"

import { reportExport } from "../../../../../../features/report/report-export-copy.ts"
import { useSession } from "../../../../../../stores/session.ts"
import type { SaveState } from "../../../../../ui/expand-button/save-button.tsx"

export type ReportExportNotice =
  | { readonly kind: "none" }
  | { readonly kind: "saved"; readonly path: string }
  | { readonly kind: "failed"; readonly reason: string }

export type ReportExportModel = {
  readonly state: SaveState
  readonly notice: ReportExportNotice
  /** 本文の根（`data-report-body`）の写しを作って保存する。根が見つからなければ失敗として知らせる。 */
  readonly save: (root?: Element) => void
  readonly openInBrowser: () => void
  readonly revealInFinder: () => void
  readonly dismiss: () => void
}

const NO_ROOT_REASON = "保存するレポートが画面に見つからなかった"
const FAILED_REASON = "サーバに繋がらず保存できなかった"

export function useReportExport(turnId: number): ReportExportModel {
  const dispatchAwaited = useSession((session) => session.dispatchAwaited)
  const [state, setState] = useState<SaveState>("idle")
  const [notice, setNotice] = useState<ReportExportNotice>({ kind: "none" })

  const saveRoot = async (root: Element): Promise<void> => {
    setState("saving")
    setNotice({ kind: "none" })
    const copy = reportExport(root)
    const result = await dispatchAwaited((client) =>
      client.reportExport.save({ turnId, bodyHtml: copy.html, css: copy.css }),
    )
    if (result.kind === "ok") {
      setState("saved")
      setNotice({ kind: "saved", path: result.value.path })
      return
    }
    setState("idle")
    setNotice({
      kind: "failed",
      reason: result.kind === "invalid" ? result.reason : FAILED_REASON,
    })
  }

  const save = (root?: Element): void => {
    if (root === undefined) {
      setNotice({ kind: "failed", reason: NO_ROOT_REASON })
      return
    }
    void saveRoot(root)
  }

  const openSaved = (open: "openInBrowser" | "revealInFinder"): void => {
    if (notice.kind !== "saved") {
      return
    }
    const { path } = notice
    void dispatchAwaited((client) => client.reportExport[open]({ path }))
  }

  return {
    state,
    notice,
    save,
    openInBrowser: () => openSaved("openInBrowser"),
    revealInFinder: () => openSaved("revealInFinder"),
    dismiss: () => {
      setNotice({ kind: "none" })
      setState("idle")
    },
  }
}

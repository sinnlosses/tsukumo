// コマンドのルータを組むテストのうち、最終レポートの書き出しを使わないものが渡す口。
// どれも書かない・開かない（呼ばれたら書けない・開けないと答える）。

import type { ReportExportCommandPorts } from "../../src/server/report/core/export/report-export-command.ts"
import { INITIAL_SESSION_STATE } from "../../src/shared/session/session-state.ts"

export const UNUSED_REPORT_EXPORT_PORTS = {
  state: () => INITIAL_SESSION_STATE,
  findImage: () => undefined,
  now: () => 0,
  localTimeAt: () => Temporal.PlainDateTime.from("2026-01-01T00:00"),
  folder: {
    write: () => Promise.resolve({ kind: "failed" }),
    openInBrowser: () => Promise.resolve(false),
    revealInFinder: () => Promise.resolve(false),
  },
} satisfies ReportExportCommandPorts

// 最終レポートの書き出しの配線。保存先は `~/Downloads/`、開く・表示するは `open`、表紙の帯の「場所」は作業ツリーの名前と HEAD。

import { basename, join } from "node:path"

import { localPlainDateTimeAt } from "../server/adapter/local-time.ts"
import { userHomeDir } from "../server/adapter/tsukumo-home.ts"
import { openExportedFile } from "../server/host/adapter/browser-host.ts"
import { createReportExportFolder } from "../server/report/adapter/report-export-file.ts"
import type { ReportExportCommandPorts } from "../server/report/core/export/report-export-command.ts"
import type { ReportImageShelf } from "../server/report/core/image/report-image-shelf.ts"
import { runGit } from "../server/repository/adapter/git.ts"
import type { SessionState } from "../shared/session/session-state.ts"
import type { WiringContext } from "./wiring-context.ts"

const DOWNLOADS_DIRECTORY_NAME = "Downloads"

export function wireReportExport(
  context: WiringContext,
  options: {
    readonly state: () => SessionState
    readonly reportImageShelf: ReportImageShelf
  },
): ReportExportCommandPorts {
  return {
    state: options.state,
    findImage: (toolUseId, path) => options.reportImageShelf.find(toolUseId, path),
    now: context.now,
    localTimeAt: localPlainDateTimeAt,
    location: () => repositoryLocation(context.cwd),
    folder: createReportExportFolder({
      directory: join(userHomeDir(), DOWNLOADS_DIRECTORY_NAME),
      launch: openExportedFile,
    }),
  }
}

async function repositoryLocation(cwd: string): Promise<string> {
  const head = await runGit(cwd, ["rev-parse", "--short", "HEAD"])
  const name = basename(cwd)
  return head.kind === "output" && head.stdout.trim() !== ""
    ? `${name} @ ${head.stdout.trim()}`
    : name
}

// ホストの配線。レポートのパスを開くコマンドの中身を選ぶ。

import { createOrcaHost } from "../server/host/adapter/orca-host.ts"
import type { HostCommandPorts } from "../server/host/core/host-command.ts"
import { openTrackedFile } from "../server/host/core/tracked-file.ts"
import { listRepositoryFiles } from "../server/repository/adapter/repository-file.ts"
import type { WiringContext } from "./wiring-context.ts"

export function wireHost(context: WiringContext): { readonly commands: HostCommandPorts } {
  // `createOrcaHost()` は状態を持たないので、起動の段取りとは別にここでも1つ作ってよい。
  const host = createOrcaHost()
  return {
    commands: {
      openFile: (path) =>
        openTrackedFile(
          path,
          () => listRepositoryFiles(context.cwd),
          (tracked) => host.openFile(tracked),
        ),
    },
  }
}

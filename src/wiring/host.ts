// ホストの配線。設定でホストの実装を選び、レポートのパスを開くコマンドの中身を組む。

import type { HostKind } from "../server/core/config.ts"
import { createBrowserHost } from "../server/host/adapter/browser-host.ts"
import { createNoneHost } from "../server/host/adapter/none-host.ts"
import { createOrcaHost } from "../server/host/adapter/orca-host.ts"
import type { HostCommandPorts } from "../server/host/core/host-command.ts"
import type { Host } from "../server/host/core/host.ts"
import { openTrackedFile } from "../server/host/core/tracked-file.ts"
import { listRepositoryFiles } from "../server/repository/adapter/repository-file.ts"
import type { WiringContext } from "./wiring-context.ts"

/** `TSUKUMO_HOST` で選んだホストの実装を作る。 */
export function createHost(kind: HostKind): Host {
  switch (kind) {
    case "orca":
      return createOrcaHost()
    case "browser":
      return createBrowserHost()
    case "none":
      return createNoneHost()
  }
}

export function wireHost(
  context: WiringContext,
  host: Host,
): { readonly commands: HostCommandPorts } {
  return {
    commands: {
      openFile: (path) =>
        openTrackedFile(
          path,
          async () => (await listRepositoryFiles(context.cwd)).paths,
          (tracked) => host.openFile(tracked),
        ),
    },
  }
}

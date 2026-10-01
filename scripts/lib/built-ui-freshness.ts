// 組み立て済みのブラウザ側（`dist/browser/`）が、読める状態で、ソースより古くないことを確かめる。

import { readUiBundle } from "../../src/server/view-server/adapter/bundle.ts"

/** 読めない・古いときは、打つコマンドを添えた `Error` を投げる。黙って組み立て直さない。 */
export async function assertBuiltUiFresh(builtDir: string): Promise<void> {
  const built = await readUiBundle(builtDir)
  if (!built.ok) {
    throw new Error(built.reason)
  }
  if (built.outdated) {
    throw new Error(
      `${builtDir} が src/browser/・src/shared/ より古い。pnpm run build を打ってから流す`,
    )
  }
}

// git の pre-commit から呼ばれる入口。ステージしたファイルの大きさの検査は、`pnpm run token-limit` と同じ入口の `--staged` に任せる。

import { spawnSync } from "node:child_process"
import process from "node:process"
import { fileURLToPath } from "node:url"

const ENTRY = fileURLToPath(new URL("../dev/token-limit.ts", import.meta.url))

const result = spawnSync("node", [ENTRY, "--staged"], { stdio: "inherit" })
process.exit(result.status ?? 0)

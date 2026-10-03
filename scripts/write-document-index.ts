// ADR の一覧表と用語集の索引を、見出しから書き直す（`pnpm run format` が打つ）。

import { fileURLToPath } from "node:url"

import { writeIndexes } from "./lib/document-index-repository.ts"

writeIndexes(fileURLToPath(new URL("..", import.meta.url)))

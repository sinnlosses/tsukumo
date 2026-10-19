// ADR の一覧表と用語集の索引を、題と見出しから書き直す（`pnpm run format` が打つ）。

import { REPOSITORY_ROOT } from "../shared/repository-root.ts"
import { writeIndexes } from "./lib/document-index-repository.ts"

writeIndexes(REPOSITORY_ROOT)

// `pnpm run test:e2e` の入口。組み立ててから `@playwright/test` で E2E を流す。
// 使い方: pnpm run test:e2e test/e2e/<シナリオ>.test.ts [Playwright の旗（--workers・--max-failures・--reporter など）]
// 引数は Playwright へそのまま渡す。JSON の出力先は環境変数 PLAYWRIGHT_JSON_OUTPUT_FILE。
// ファイルを渡さない全件は、`TSUKUMO_E2E_FULL=1` を立てた呼び出しだけが通す。

import { spawn, spawnSync } from "node:child_process"
import process from "node:process"

import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import { E2E_FULL_VARIABLE, judgeE2eFull, shouldTypecheckBeforeE2e } from "./lib/e2e-full-guard.ts"

const args = process.argv.slice(2)
const fullValue = process.env[E2E_FULL_VARIABLE]

const judgement = judgeE2eFull(args, fullValue)
if (judgement.kind === "deny") {
  process.stderr.write(judgement.message)
  process.exit(2)
}

const build = spawnSync("pnpm", ["run", "build"], { cwd: ROOT, stdio: "inherit" })
if (build.status !== 0) {
  process.exit(build.status ?? 1)
}
if (shouldTypecheckBeforeE2e(fullValue)) {
  const typecheck = spawnSync("pnpm", ["exec", "tsc", "--noEmit"], { cwd: ROOT, stdio: "inherit" })
  if (typecheck.status !== 0) {
    process.exit(typecheck.status ?? 1)
  }
}

const playwrightArguments = args.some((arg) => arg.startsWith("--reporter="))
  ? args
  : [...args, "--reporter=list"]

let receivedSignal: NodeJS.Signals | undefined
const child = spawn("pnpm", ["exec", "playwright", "test", ...playwrightArguments], {
  cwd: ROOT,
  env: { ...process.env, TZ: "UTC" },
  stdio: "inherit",
})
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    receivedSignal = signal
    child.kill(signal)
  })
}
const status = await new Promise<number>((resolve) => {
  child.on("close", (code) => {
    resolve(code ?? 1)
  })
})

process.exit(receivedSignal === undefined ? status : 128 + (receivedSignal === "SIGTERM" ? 15 : 2))

// `pnpm run test:e2e` の入口。組み立ててから `@playwright/test` で E2E を流す。
// ファイルを渡さない全件は、`TSUKUMO_E2E_FULL=1` を立てた呼び出しだけが通す。

import { spawn, spawnSync } from "node:child_process"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import { parseE2eArgument, playwrightArguments } from "./lib/e2e-argument.ts"
import { E2E_FULL_VARIABLE, judgeE2eFull, shouldTypecheckBeforeE2e } from "./lib/e2e-full-guard.ts"
import { foldE2eReport } from "./lib/e2e-report.ts"

const E2E_USAGE = `使い方:
  pnpm run test:e2e test/e2e/<シナリオ>.test.ts [--bail=<n>] [--maxWorkers=<n>] [--reporter=<名>] [--outputFile.json=<パス>]
`

const args = process.argv.slice(2)
const fullValue = process.env[E2E_FULL_VARIABLE]

const argument = parseE2eArgument(args)
if (argument.kind === "unknown") {
  process.stderr.write(`知らない引数: ${argument.arguments.join(" ")}\n${E2E_USAGE}`)
  process.exit(2)
}

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

const playwrightReport = join(tmpdir(), `tsukumo-e2e-${process.pid}-playwright.json`)

let receivedSignal: NodeJS.Signals | undefined
const child = spawn("pnpm", ["exec", "playwright", "test", ...playwrightArguments(argument)], {
  cwd: ROOT,
  env: { ...process.env, TZ: "UTC", PLAYWRIGHT_JSON_OUTPUT_FILE: playwrightReport },
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

if (argument.jsonOutputFile !== undefined) {
  writeFileSync(argument.jsonOutputFile, foldE2eReport(readIfExists(playwrightReport)))
}
rmSync(playwrightReport, { force: true })

process.exit(receivedSignal === undefined ? status : 128 + (receivedSignal === "SIGTERM" ? 15 : 2))

function readIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

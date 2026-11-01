// `pnpm run test:e2e` の入口。組み立ててから E2E を流す。
// 渡されたファイルを `PLAYWRIGHT_E2E_FILES` で分け、vitest → `@playwright/test` の順に続けて流す。
// ファイルを渡さない全件は、`TSUKUMO_E2E_FULL=1` を立てた呼び出しだけが通す。

import { type ChildProcess, spawn, spawnSync } from "node:child_process"
import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import process from "node:process"

import { PLAYWRIGHT_E2E_FILES, splitE2eFiles } from "../shared/e2e-runner.ts"
import { REPOSITORY_ROOT as ROOT } from "../shared/repository-root.ts"
import { parseE2eArgument, playwrightArguments, vitestArguments } from "./lib/e2e-argument.ts"
import { E2E_FULL_VARIABLE, judgeE2eFull, shouldTypecheckBeforeE2e } from "./lib/e2e-full-guard.ts"
import { mergeE2eReports } from "./lib/e2e-report.ts"

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

const isFull = argument.files.length === 0
const split = splitE2eFiles(argument.files)
const runVitest = isFull || split.vitest.length > 0
const runPlaywright = isFull ? PLAYWRIGHT_E2E_FILES.length > 0 : split.playwright.length > 0

const vitestReport = join(tmpdir(), `tsukumo-e2e-${process.pid}-vitest.json`)
const playwrightReport = join(tmpdir(), `tsukumo-e2e-${process.pid}-playwright.json`)
const wantsJson = argument.jsonOutputFile !== undefined

let current: ChildProcess | undefined
let receivedSignal: NodeJS.Signals | undefined
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    receivedSignal = signal
    current?.kill(signal)
  })
}

let status = 0
if (runVitest) {
  status = await run(
    [
      "exec",
      "vitest",
      "run",
      "--config",
      "vitest.e2e.config.ts",
      ...vitestArguments(argument, split.vitest, wantsJson ? vitestReport : undefined),
    ],
    process.env,
  )
}
if (runPlaywright && receivedSignal === undefined) {
  const playwrightStatus = await run(
    ["exec", "playwright", "test", ...playwrightArguments(argument, split.playwright)],
    { ...process.env, TZ: "UTC", PLAYWRIGHT_JSON_OUTPUT_FILE: playwrightReport },
  )
  status = status === 0 ? playwrightStatus : status
}

if (argument.jsonOutputFile !== undefined) {
  writeFileSync(
    argument.jsonOutputFile,
    mergeE2eReports(
      runVitest ? readIfExists(vitestReport) : undefined,
      runPlaywright ? readIfExists(playwrightReport) : undefined,
    ),
  )
}
rmSync(vitestReport, { force: true })
rmSync(playwrightReport, { force: true })

process.exit(receivedSignal === undefined ? status : 128 + (receivedSignal === "SIGTERM" ? 15 : 2))

function run(pnpmArgs: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve) => {
    current = spawn("pnpm", pnpmArgs, { cwd: ROOT, env, stdio: "inherit" })
    current.on("close", (code) => {
      resolve(code ?? 1)
    })
  })
}

function readIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

// 手元で並べて動いている部屋（tsukumo のビュー）を、iframe で格子に並べた1枚の HTML にして
// Orca に開く。動いているプロセスは変えない、一度きりのスナップショットの道具。並べるのは
// 「ポートで待ち受けていて、かつ Orca のタブがある」部屋だけ。
//
// 使い方: bun run scripts/open-room-grid.ts
//
// 起動トークン（`?t=`）は消えない状態で $TMPDIR に一時ファイルとして書く。**読み込めたと確認でき
// 次第、あるいは確認できないまま待った末にも、必ずそのファイルを消す**（ディスクにトークンを
// 残さない）。見直すときはこのスクリプトを打ち直す。

import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"
import process from "node:process"

import { closeTab, listTabs, openTab, type OrcaTab } from "../src/server/adapter/orca-host.ts"
import { roomName } from "../src/shared/room.ts"
import { candidatePorts, findListener } from "./lib/port-listener.ts"
import { buildRoomGridHtml, pickRooms, ROOM_GRID_TITLE, scanPorts, type Room } from "./room-grid.ts"

/** 開いたタブの `<title>` が格子のものに変わるまで待つ間隔と上限。 */
const LOAD_POLL_INTERVAL_MS = 150
const LOAD_POLL_TIMEOUT_MS = 8_000

await main()

async function main(): Promise<void> {
  const tabsResult = await listTabs()
  if (!tabsResult.ok) {
    process.stderr.write(`タブ一覧を取得できなかった: ${tabsResult.reason}\n`)
    process.exit(1)
  }

  const tabUrls = tabsResult.tabs.map((tab) => tab.url)
  const ports = scanPorts(candidatePorts(), tabUrls)
  const listeners = ports.flatMap((port) => findListener(port) ?? [])
  const matched = pickRooms(listeners, tabUrls)

  if (matched.length === 0) {
    process.stdout.write(
      "並べる部屋が無い（ポートで待ち受けていて、かつ Orca のタブもある部屋が見つからなかった）\n",
    )
    return
  }

  const rooms = matched.map((room) => buildRoom(room.port, room.pid, room.url))
  const html = buildRoomGridHtml(rooms)

  const path = join(tmpdir(), `tsukumo-room-grid-${randomUUID()}.html`)
  writeFileSync(path, html, { mode: 0o600 })

  await closePreviousGridTabs(tabsResult.tabs)

  const opened = await openTab(`file://${path}`)
  if (!opened.ok) {
    rmSync(path, { force: true })
    process.stderr.write(`格子のタブを開けなかった: ${opened.reason}\n`)
    process.exit(1)
  }

  const loaded = await waitUntilLoaded(opened.pageId)
  rmSync(path, { force: true })
  if (!loaded) {
    process.stderr.write(
      `読み込めたかを確認できないまま時間切れになった（それでも一時ファイルは消した）\n`,
    )
  }

  process.stdout.write(`格子を開いた: ${String(rooms.length)} 部屋\n`)
}

/** 前回の格子のタブ（`<title>` が同じもの）を、新しいタブを開く前に閉じる。タブを溜めない。 */
async function closePreviousGridTabs(tabs: readonly OrcaTab[]): Promise<void> {
  const previous = tabs.filter((tab) => tab.title === ROOM_GRID_TITLE)
  for (const tab of previous) {
    const result = await closeTab(tab.pageId)
    if (!result.ok) {
      process.stderr.write(`前回の格子のタブを閉じられなかった: ${result.reason}\n`)
    }
  }
}

/**
 * 開いたタブの `<title>` が格子の題（{@link ROOM_GRID_TITLE}）に変わるまで、短い間隔で
 * `orca tab list` を見る。**JS を置かずに読み込みを判定する**ための、外から見える唯一の手掛かり。
 */
async function waitUntilLoaded(pageId: string): Promise<boolean> {
  const deadline = Temporal.Now.instant().epochMilliseconds + LOAD_POLL_TIMEOUT_MS
  while (Temporal.Now.instant().epochMilliseconds < deadline) {
    const tabsResult = await listTabs()
    if (
      tabsResult.ok &&
      tabsResult.tabs.some((tab) => tab.pageId === pageId && tab.title === ROOM_GRID_TITLE)
    ) {
      return true
    }
    await delay(LOAD_POLL_INTERVAL_MS)
  }
  return false
}

/** 部屋1件ぶんの表示用の情報を組み立てる。cwd・ブランチが取れないときは欄を空けるだけでマスは出す。 */
function buildRoom(port: number, pid: number, url: string): Room {
  const cwd = processCwd(pid)
  return {
    port,
    name: roomName(port),
    url,
    worktree: cwd === undefined ? undefined : basename(cwd),
    branch: cwd === undefined ? undefined : gitBranch(cwd),
  }
}

/** プロセスの cwd を `lsof -d cwd` で引く。取れなければ undefined。 */
function processCwd(pid: number): string | undefined {
  const output = run("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"])
  const nameLine = output.split("\n").find((line) => line.startsWith("n"))
  return nameLine === undefined ? undefined : nameLine.slice(1)
}

/** その cwd で `git branch --show-current` を引く。取れない・detached HEAD なら undefined。 */
function gitBranch(cwd: string): string | undefined {
  const branch = run("git", ["-C", cwd, "branch", "--show-current"]).trim()
  return branch === "" ? undefined : branch
}

function run(file: string, args: readonly string[]): string {
  try {
    return execFileSync(file, [...args], { encoding: "utf8" })
  } catch {
    return ""
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

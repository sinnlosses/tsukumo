// 手元で並べて動いている部屋（tsukumo のビュー）を、iframe で格子に並べた1枚の HTML にして
// Orca に開く。並べるのは「ポートで待ち受けていて、かつ Orca のタブがある」部屋だけ。
//
// 使い方: bun run scripts/open-room-grid.ts
//
// 格子のタブを開いているあいだ常駐する。127.0.0.1 の空きポート（OS に選ばせるので、tsukumo の
// 探索範囲には入らない）で格子を配る小さな HTTP サーバになり、格子のページを読み込むたびに
// 走査し直して組み立て直す（ブラウザの再読み込みも、ページ内の「再読み込み」も同じ経路）。
// 格子のページには全部の部屋の起動トークンが入るので、HTML も起動トークンもメモリだけに置いて
// ディスクには書かず、格子のサーバ用の乱数の鍵（`?t=`）が付いていない要求は断る。
//
// 終わるのは、格子のタブが Orca から消えたとき（間隔を空けて `orca tab list` で見る）と Ctrl-C。
// 打ち直すと前回の格子のタブを閉じるので、前のプロセスもそれを見て終わる。動いている tsukumo の
// プロセスは変えない。

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http"
import { basename } from "node:path"
import process from "node:process"

import { closeTab, listTabs, openTab, type OrcaTab } from "../src/server/host/adapter/orca-host.ts"
import { createStartupToken } from "../src/server/view-server/adapter/server.ts"
import { roomName } from "../src/shared/room.ts"
import { candidatePorts, findListener, run, type Listener } from "./lib/port-listener.ts"
import {
  buildRoomGridHtml,
  type GridTabObservation,
  type GridTabWatch,
  observeGridTab,
  pickRooms,
  previousGridTabs,
  roomGridPath,
  routeRoomGridRequest,
  scanPorts,
  type Room,
} from "./room-grid.ts"

/** 格子のサーバを待ち受けさせるホスト。tsukumo のビューサーバと同じく外からは届かせない。 */
const BIND_HOST = "127.0.0.1"

/** 格子のタブがまだ Orca にあるかを見に行く間隔。 */
const WATCH_INTERVAL_MS = 3_000

/** 止まっているタブを作業ツリーの名指しで起こすときの、聞き直す回数と間隔。 */
const WAKE_POLL_ATTEMPTS = 10
const WAKE_POLL_INTERVAL_MS = 300

await main()

async function main(): Promise<void> {
  const key = createStartupToken()
  const server = createServer((request, response) => {
    // 読み込み1回の失敗で常駐プロセスを落とさない。受け止めるのはここ1箇所。
    respond(request, response, key).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`格子を組み立てられなかった: ${message}\n`)
      if (!response.headersSent) {
        writeText(response, 500, "格子を組み立てられなかった\n")
      }
    })
  })
  const port = await listen(server)

  const tabsResult = await listTabs("all")
  if (tabsResult.ok) {
    await closePreviousGridTabs(tabsResult.tabs)
  } else {
    process.stderr.write(`前回の格子のタブを探せなかった: ${tabsResult.reason}\n`)
  }

  const opened = await openTab(`http://${BIND_HOST}:${String(port)}${roomGridPath(key)}`)
  if (!opened.ok) {
    process.stderr.write(`格子のタブを開けなかった: ${opened.reason}\n`)
    process.exit(1)
  }

  process.stdout.write(
    "格子を開いた（再読み込みで並べ直す。格子のタブを閉じるか Ctrl-C で終わる）\n",
  )

  const last = await watchGridTab(opened.pageId)
  process.stdout.write(
    last === "failed"
      ? "タブ一覧を取得できない状態が続いたので終わる\n"
      : "格子のタブが閉じられたので終わる\n",
  )
  server.closeAllConnections()
  server.close()
}

/** OS に空きポートを選ばせて待ち受け、そのポート番号を返す。待ち受けられなければ即時終了。 */
function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.once("error", (error) => {
      process.stderr.write(`格子のサーバを待ち受けられなかった: ${error.message}\n`)
      process.exit(1)
    })
    server.listen(0, BIND_HOST, () => {
      const address = server.address()
      if (address === null || typeof address === "string") {
        process.stderr.write("格子のサーバの待ち受けポートを読めなかった\n")
        process.exit(1)
      }
      resolve(address.port)
    })
  })
}

/** 格子のサーバへの要求1件に答える。格子のページは読み込むたびに走査し直して組み立てる。 */
async function respond(
  request: IncomingMessage,
  response: ServerResponse,
  key: string,
): Promise<void> {
  const route = routeRoomGridRequest(request.method ?? "", request.url ?? "/", key)
  switch (route) {
    case "not-found":
      writeText(response, 404, "not found\n")
      return
    case "forbidden":
      writeText(response, 403, "forbidden\n")
      return
    case "grid": {
      const scanned = await scanRooms()
      if (!scanned.ok) {
        writeText(response, 503, `タブ一覧を取得できなかった: ${scanned.reason}\n`)
        return
      }
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      })
      response.end(buildRoomGridHtml(scanned.rooms, roomGridPath(key)))
      return
    }
  }
}

function writeText(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
  })
  response.end(body)
}

/**
 * タブの一覧とポートを走査して、いま並べる部屋を集める。待ち受けているのに一覧にタブが出て
 * こなかった部屋だけは、作業ツリーを名指しして起こし直す（最大でおよそ3秒待つ）。
 */
async function scanRooms(): Promise<
  | { readonly ok: true; readonly rooms: readonly Room[] }
  | { readonly ok: false; readonly reason: string }
> {
  const tabsResult = await listTabs("all")
  if (!tabsResult.ok) {
    return { ok: false, reason: tabsResult.reason }
  }

  const listedUrls = tabsResult.tabs.map((tab) => tab.url)
  const ports = scanPorts(candidatePorts(), listedUrls)
  const listeners = ports.flatMap((port) => findListener(port) ?? [])
  const unlisted = listeners.filter((listener) => pickRooms([listener], listedUrls).length === 0)
  const wokenUrls = await Promise.all(unlisted.map((listener) => wakeViewTabUrls(listener)))
  const tabUrls = [...listedUrls, ...wokenUrls.flat()]
  const matched = pickRooms(listeners, tabUrls)

  return { ok: true, rooms: matched.map((room) => buildRoom(room.port, room.pid, room.url)) }
}

/** 前回の格子のタブを、新しいタブを開く前に閉じる。タブを溜めない。 */
async function closePreviousGridTabs(tabs: readonly OrcaTab[]): Promise<void> {
  for (const tab of previousGridTabs(tabs)) {
    const result = await closeTab(tab.pageId)
    if (!result.ok) {
      process.stderr.write(`前回の格子のタブを閉じられなかった: ${result.reason}\n`)
    }
  }
}

/**
 * 開いた格子のタブが Orca に残っているかを、間隔を空けて見張る。終わるべきと決まったら、その
 * 決め手になった回の結果を返す。タブは `orca tab create` を打った作業ツリー（このプロセスの cwd）に
 * 開くので、その作業ツリーを名指しして聞く（`"all"` は、しばらく表示していない作業ツリーのタブを
 * 落とすことがあり、閉じていないのに消えたと見誤る）。
 */
async function watchGridTab(pageId: string): Promise<GridTabObservation> {
  const worktreePath = process.cwd()
  let watch: GridTabWatch = { absent: 0, failed: 0 }
  for (;;) {
    await delay(WATCH_INTERVAL_MS)
    const listed = await listTabs({ worktreePath })
    const observation: GridTabObservation = !listed.ok
      ? "failed"
      : listed.tabs.some((tab) => tab.pageId === pageId)
        ? "present"
        : "absent"
    const next = observeGridTab(watch, observation)
    if (next.stop) {
      return observation
    }
    watch = next.watch
  }
}

/**
 * 待ち受けているのに `"all"` の一覧にタブが出てこなかった部屋について、そのプロセスの cwd の
 * 作業ツリーを名指しして聞き直す。名指しで聞くと止まっていたページが起きて `url` が埋まる
 * （`listTabs` の説明）ので、その部屋のビューの URL が出てくるまで短い間隔で繰り返す。
 * 最後まで出てこなければ空で返し、その部屋は並べない。
 */
async function wakeViewTabUrls(listener: Listener): Promise<readonly string[]> {
  const cwd = processCwd(listener.pid)
  if (cwd === undefined) {
    return []
  }
  for (let attempt = 0; attempt < WAKE_POLL_ATTEMPTS; attempt += 1) {
    const listed = await listTabs({ worktreePath: cwd })
    const urls = listed.ok ? listed.tabs.map((tab) => tab.url) : []
    if (pickRooms([listener], urls).length > 0) {
      return urls
    }
    await delay(WAKE_POLL_INTERVAL_MS)
  }
  return []
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

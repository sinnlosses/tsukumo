// 動いている部屋（待ち受けポート × Orca のタブ）を突き合わせ、格子の HTML を組み立てる。
// 格子を配るサーバの要求の振り分け（鍵の照合）と、格子のタブを見張って終わりどきを決める判断も
// ここに置く。**外の世界に触らない純粋な関数だけ**をここに置く（lsof / orca / git / HTTP を
// 実際に扱うのは scripts/open-room-grid.ts）。テストは test/scripts/room-grid.test.ts。
//
// 並べるのは「ポートで待ち受けていて、かつ Orca のタブがある」部屋だけ。タブだけの部屋
// （プロセスが止まった）・待ち受けだけの部屋（起動トークンが取り戻せない）は落とす。

import type { OrcaTab } from "../src/server/host/adapter/orca-host.ts"
import { LAYOUT_PATH } from "../src/server/view-server/adapter/server.ts"
import { SESSION_TOKEN_QUERY_NAME } from "../src/shared/session-socket.ts"
import type { Listener } from "./lib/port-listener.ts"

/** 前回開いた格子のタブを見分けて閉じるための、固定の `<title>`。会話由来ではない定型文。 */
export const ROOM_GRID_TITLE = "tsukumoの格子"

/**
 * 格子を配るパス。**部屋のレイアウトページ（`LAYOUT_PATH`）と違うパスにする** — 格子のタブの URL
 * も `127.0.0.1` なので、同じパスだと {@link pickRooms} に格子自身が部屋として拾われる。
 */
export const ROOM_GRID_PATH = "/room-grid"

/** 格子のサーバへの要求の行き先。 */
export type RoomGridRoute = "grid" | "forbidden" | "not-found"

/** 格子のタブを見張った1回ぶんの結果。`"failed"` は `orca tab list` そのものが失敗した回。 */
export type GridTabObservation = "present" | "absent" | "failed"

/** 格子のタブを見張る側が持ち回す、続けて起きた回数。 */
export type GridTabWatch = {
  readonly absent: number
  readonly failed: number
}

/** 待ち受け × タブが噛み合った部屋1つ（cwd・ブランチはまだ乗っていない）。 */
export type MatchedRoom = {
  readonly port: number
  readonly pid: number
  readonly url: string
}

/** 格子の1マスに並べる部屋。 */
export type Room = {
  readonly port: number
  readonly name: string
  readonly url: string
  readonly worktree: string | undefined
  readonly branch: string | undefined
}

/**
 * 既定の探索範囲に、ビューのタブ（`127.0.0.1` のレイアウトページ）の URL に出てきたポートを足す。
 * `TSUKUMO_VIEW_PORT` で既定の帯の外を指した部屋も、タブさえ開いていれば拾えるようにする。
 * 格子のタブ自身のポートは、パスが違うので足さない。
 */
export function scanPorts(
  defaultPorts: readonly number[],
  tabUrls: readonly string[],
): readonly number[] {
  const fromTabs = tabUrls.flatMap((url) => {
    const port = viewTabPort(url)
    return port === undefined ? [] : [port]
  })
  return [...new Set([...defaultPorts, ...fromTabs])].sort((a, b) => a - b)
}

/**
 * 待ち受け（`Listener`）とタブの URL を突き合わせ、両方そろった部屋だけを返す。**待ち受けている
 * のが tsukumo かどうかは、タブの URL のホストが `127.0.0.1` でパスがレイアウトページ
 * （`LAYOUT_PATH`）であることで判断する**（クエリの起動トークンは比べない——起動ごとに変わるため）。
 */
export function pickRooms(
  listeners: readonly Listener[],
  tabUrls: readonly string[],
): readonly MatchedRoom[] {
  const listenerByPort = new Map(listeners.map((listener) => [listener.port, listener]))
  const rooms = new Map<number, MatchedRoom>()

  for (const url of tabUrls) {
    const port = viewTabPort(url)
    if (port === undefined || rooms.has(port)) {
      continue
    }
    const listener = listenerByPort.get(port)
    if (listener === undefined) {
      continue
    }
    rooms.set(port, { port, pid: listener.pid, url })
  }

  return [...rooms.values()].sort((a, b) => a.port - b.port)
}

/**
 * 打ち直したときに閉じる、前回の格子のタブ（`<title>` が {@link ROOM_GRID_TITLE} のもの）。
 * タブが閉じれば、それを開いた前回のプロセスも見張りで気づいて終わる。
 */
export function previousGridTabs(tabs: readonly OrcaTab[]): readonly OrcaTab[] {
  return tabs.filter((tab) => tab.title === ROOM_GRID_TITLE)
}

/**
 * 格子のページの、オリジンを除いた URL（パス + 鍵）。タブを開く URL にも、ページ内の再読み込みの
 * リンクにも使う。鍵のクエリ名は部屋の起動トークン（`?t=`）に揃える。
 */
export function roomGridPath(key: string): string {
  return `${ROOM_GRID_PATH}?${SESSION_TOKEN_QUERY_NAME}=${encodeURIComponent(key)}`
}

/**
 * 格子のサーバへの要求を振り分ける。**格子のページには全部の部屋の起動トークンが入る**ので、
 * `127.0.0.1` の他のページやプロセスから読まれないよう、鍵（`?t=`）が合わない要求は断る。
 */
export function routeRoomGridRequest(
  method: string,
  requestUrl: string,
  key: string,
): RoomGridRoute {
  let parsed: URL
  try {
    parsed = new URL(requestUrl, "http://127.0.0.1")
  } catch {
    return "not-found"
  }
  if (method !== "GET" || parsed.pathname !== ROOM_GRID_PATH) {
    return "not-found"
  }
  return parsed.searchParams.get(SESSION_TOKEN_QUERY_NAME) === key ? "grid" : "forbidden"
}

/** 続けて何回タブが見えなければ、閉じられたとみなすか。1回きりの取りこぼしでは終わらない。 */
const GRID_TAB_ABSENT_LIMIT = 2

/** 続けて何回 `orca tab list` が失敗すれば、Orca が居なくなったとみなすか。 */
const GRID_TAB_FAILED_LIMIT = 20

/**
 * 格子のタブを見張った1回ぶんを畳み込み、終わるかどうかを決める。**見えなかった回・失敗した回は
 * 続けて起きた数だけを数える**（間に見えた回が挟まれば数え直す）。失敗は Orca の一時的な不調でも
 * 起きるので、見えなかった回よりずっと多く待つ。
 */
export function observeGridTab(
  watch: GridTabWatch,
  observation: GridTabObservation,
): { readonly watch: GridTabWatch; readonly stop: boolean } {
  switch (observation) {
    case "present":
      return { watch: { absent: 0, failed: 0 }, stop: false }
    case "absent": {
      const absent = watch.absent + 1
      return { watch: { absent, failed: 0 }, stop: absent >= GRID_TAB_ABSENT_LIMIT }
    }
    case "failed": {
      const failed = watch.failed + 1
      return { watch: { absent: watch.absent, failed }, stop: failed >= GRID_TAB_FAILED_LIMIT }
    }
  }
}

/**
 * 各マスの iframe を描く仮の大きさ（16:9）。ビューは幅 760px 以下で狭い画面の並びに切り替わる
 * （docs/requirements.md 4.7）ので、マスの実寸で描かせずにこの大きさで広い画面として描かせ、
 * マスの幅まで縮めて見せる。
 */
const ROOM_FRAME_WIDTH_PX = 1600
const ROOM_FRAME_HEIGHT_PX = 900

/** 「格子に戻る」が選ぶ、どのマスも広げない側のラジオボタン。 */
const ROOM_FOCUS_NONE_ID = "room-focus-none"

/**
 * 格子1枚ぶんの HTML。JS は置かない。「拡大」「格子に戻る」は同じ名前のラジオボタンの `<label>` で、
 * 選ばれたマスが `:has(:checked)` の CSS で全面に広がる。**リンク（`#` への移動）にしない** —
 * Orca はページ内の移動でもページを読み直しに行く（`file://` で開いていたときに実測）ので、拡大の
 * たびに走査し直すことになる。
 *
 * 「再読み込み」は同じ格子の URL（`reloadHref`。鍵込み）へのただのリンクで、読み込むたびにサーバが
 * 走査し直すので、ブラウザの再読み込みと同じ経路になる。広げたマスの上には出さない（格子に戻って
 * から押す）。ラジオボタンは `autocomplete="off"` にして、読み直したあとは必ず格子の並びに戻す
 * （部屋の顔ぶれが変わったあとに、ブラウザが前の選択を別のマスに当て直さないように）。
 */
export function buildRoomGridHtml(rooms: readonly Room[], reloadHref: string): string {
  const cells =
    rooms.length === 0
      ? `<p class="room-grid-empty">並べる部屋が無い（ポートで待ち受けていて、かつ Orca のタブもある部屋が見つからなかった）</p>`
      : rooms.map((room) => roomCellHtml(room)).join("\n")
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtml(ROOM_GRID_TITLE)}</title>
<style>
  body { margin: 0; padding: 12px; background: #1c1c1c; color: #eee; font-family: sans-serif; }
  .room-grid-bar { display: flex; justify-content: flex-end; margin-bottom: 8px; }
  .room-grid-reload { padding: 2px 12px; border: 1px solid #777; border-radius: 999px; font-size: 12px; color: inherit; text-decoration: none; }
  .room-grid-reload:hover { background: #444; }
  .room-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(520px, 1fr)); gap: 12px; }
  .room { display: flex; flex-direction: column; border: 1px solid #555; min-width: 0; }
  .room h2 { display: flex; gap: 8px; align-items: center; margin: 0; padding: 6px 8px; font-size: 14px; background: #333; }
  .room-focus { display: none; }
  .room-title { flex: 1; min-width: 0; cursor: pointer; }
  .room-action { flex: none; padding: 2px 10px; border: 1px solid #777; border-radius: 999px; font-size: 12px; cursor: pointer; }
  .room-action:hover { background: #444; }
  .room-close { display: none; }
  .room-frame { container-type: inline-size; aspect-ratio: ${String(ROOM_FRAME_WIDTH_PX)} / ${String(ROOM_FRAME_HEIGHT_PX)}; overflow: hidden; }
  .room iframe { display: block; width: ${String(ROOM_FRAME_WIDTH_PX)}px; height: ${String(ROOM_FRAME_HEIGHT_PX)}px; border: 0; transform-origin: 0 0; scale: calc(100cqi / ${String(ROOM_FRAME_WIDTH_PX)}px); }
  .room:has(> .room-focus:checked) { position: fixed; inset: 0; z-index: 1; margin: 0; background: #1c1c1c; }
  .room:has(> .room-focus:checked) .room-expand { display: none; }
  .room:has(> .room-focus:checked) .room-close { display: inline; }
  .room:has(> .room-focus:checked) .room-frame { flex: 1; aspect-ratio: auto; }
  .room:has(> .room-focus:checked) iframe { width: 100%; height: 100%; scale: none; }
</style>
</head>
<body>
<input class="room-focus" type="radio" name="room-focus" id="${ROOM_FOCUS_NONE_ID}" autocomplete="off" checked>
<nav class="room-grid-bar"><a class="room-grid-reload" href="${escapeHtml(reloadHref)}">再読み込み</a></nav>
<div class="room-grid">
${cells}
</div>
</body>
</html>
`
}

/** 部屋1つぶんの `<section>`。見出しに部屋の名前・作業ツリー名・ブランチ・ポートを出す。 */
function roomCellHtml(room: Room): string {
  const focusId = `room-focus-${String(room.port)}`
  const heading = [room.name, room.worktree, room.branch, String(room.port)]
    .filter((part): part is string => part !== undefined)
    .join(" ・ ")
  return `<section class="room">
<input class="room-focus" type="radio" name="room-focus" id="${focusId}" autocomplete="off">
<h2><label class="room-title" for="${focusId}">${escapeHtml(heading)}</label><label class="room-action room-expand" for="${focusId}">拡大</label><label class="room-action room-close" for="${ROOM_FOCUS_NONE_ID}">格子に戻る</label></h2>
<div class="room-frame"><iframe src="${escapeHtml(room.url)}"></iframe></div>
</section>`
}

/** タブの URL が `http://127.0.0.1:<port><LAYOUT_PATH>` の形なら、そのポート番号を返す。 */
function viewTabPort(url: string): number | undefined {
  const port = loopbackPort(url)
  if (port === undefined) {
    return undefined
  }
  try {
    return new URL(url).pathname === LAYOUT_PATH ? port : undefined
  } catch {
    return undefined
  }
}

/** URL のホストが `127.0.0.1` なら、そのポート番号を返す。 */
function loopbackPort(url: string): number | undefined {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== "127.0.0.1" || parsed.port === "") {
      return undefined
    }
    const port = Number(parsed.port)
    return Number.isInteger(port) ? port : undefined
  } catch {
    return undefined
  }
}

/** HTML の本文にも属性値にも使える、最小限のエスケープ。 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

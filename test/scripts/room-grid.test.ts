// `scripts/room-grid.ts` の純粋関数（突き合わせ・HTML の組み立て）を検証する。lsof / orca / git は
// 一切起こさない（それは scripts/open-room-grid.ts の役目）。
//
// **フィクスチャの起動トークンはすべて架空の値**（docs/coding-standards.md「会話内容の扱い」）。

import { describe, expect, test } from "bun:test"

import type { Listener } from "../../scripts/lib/port-listener.ts"
import {
  buildRoomGridHtml,
  type GridTabWatch,
  observeGridTab,
  pickRooms,
  previousGridTabs,
  type Room,
  ROOM_GRID_PATH,
  ROOM_GRID_TITLE,
  roomGridPath,
  routeRoomGridRequest,
  scanPorts,
} from "../../scripts/room-grid.ts"

const FAKE_TOKEN_A = "fake0000aaaa1111bbbb2222cccc3333"
const FAKE_TOKEN_B = "fake4444dddd5555eeee6666ffff7777"
const FAKE_GRID_KEY = "fakegridkey0000111122223333444455"
const RELOAD_HREF = roomGridPath(FAKE_GRID_KEY)

function listener(port: number, pid: number): Listener {
  return { port, pid, command: "bun run src/cli.ts" }
}

describe("scanPorts", () => {
  test("既定の範囲はそのまま残る", () => {
    expect(scanPorts([7327, 7328], [])).toEqual([7327, 7328])
  })

  test("タブの URL に出てきた 127.0.0.1 のポートを、既定の範囲の外でも足す", () => {
    const ports = scanPorts([7327, 7328], [`http://127.0.0.1:9001/?t=${FAKE_TOKEN_A}`])
    expect(ports).toEqual([7327, 7328, 9001])
  })

  test("重複は畳み、昇順にする", () => {
    const ports = scanPorts(
      [7328, 7327],
      [`http://127.0.0.1:7327/?t=${FAKE_TOKEN_A}`, `http://127.0.0.1:7327/?t=${FAKE_TOKEN_B}`],
    )
    expect(ports).toEqual([7327, 7328])
  })

  test("127.0.0.1 以外のホストは足さない", () => {
    expect(scanPorts([7327], [`http://example.com:9001/?t=${FAKE_TOKEN_A}`])).toEqual([7327])
  })

  test("URL として読めない値は無視する", () => {
    expect(scanPorts([7327], ["これは URL ではない"])).toEqual([7327])
  })

  test("レイアウトページ以外のパスのタブ（格子のタブ自身など）のポートは足さない", () => {
    const ports = scanPorts([7327], [`http://127.0.0.1:50123${roomGridPath(FAKE_GRID_KEY)}`])
    expect(ports).toEqual([7327])
  })
})

describe("pickRooms", () => {
  test("待ち受けていて、かつビューのタブもある部屋だけを拾う", () => {
    const rooms = pickRooms(
      [listener(7327, 111), listener(7328, 222)],
      [`http://127.0.0.1:7327/?t=${FAKE_TOKEN_A}`, `http://127.0.0.1:7328/?t=${FAKE_TOKEN_B}`],
    )
    expect(rooms).toEqual([
      { port: 7327, pid: 111, url: `http://127.0.0.1:7327/?t=${FAKE_TOKEN_A}` },
      { port: 7328, pid: 222, url: `http://127.0.0.1:7328/?t=${FAKE_TOKEN_B}` },
    ])
  })

  test("タブだけあって待ち受けが無い部屋は落ちる", () => {
    const rooms = pickRooms([listener(7327, 111)], [`http://127.0.0.1:7399/?t=${FAKE_TOKEN_A}`])
    expect(rooms).toEqual([])
  })

  test("待ち受けているだけでタブが無い部屋は落ちる", () => {
    const rooms = pickRooms(
      [listener(7327, 111), listener(7328, 222)],
      [`http://127.0.0.1:7327/?t=${FAKE_TOKEN_A}`],
    )
    expect(rooms).toEqual([
      { port: 7327, pid: 111, url: `http://127.0.0.1:7327/?t=${FAKE_TOKEN_A}` },
    ])
  })

  test("レイアウトページ（/）以外のパスのタブは拾わない", () => {
    const rooms = pickRooms(
      [listener(7327, 111)],
      [`http://127.0.0.1:7327/character?t=${FAKE_TOKEN_A}`],
    )
    expect(rooms).toEqual([])
  })

  test("同じポートのタブが複数あっても、部屋は1つにまとまる", () => {
    const rooms = pickRooms(
      [listener(7327, 111)],
      [`http://127.0.0.1:7327/?t=${FAKE_TOKEN_A}`, `http://127.0.0.1:7327/?t=${FAKE_TOKEN_B}`],
    )
    expect(rooms.length).toBe(1)
  })

  test("ポートの昇順で返す", () => {
    const rooms = pickRooms(
      [listener(7328, 222), listener(7327, 111)],
      [`http://127.0.0.1:7328/?t=${FAKE_TOKEN_B}`, `http://127.0.0.1:7327/?t=${FAKE_TOKEN_A}`],
    )
    expect(rooms.map((room) => room.port)).toEqual([7327, 7328])
  })
})

describe("buildRoomGridHtml", () => {
  function room(overrides: Partial<Room> = {}): Room {
    return {
      port: 7327,
      name: "空色の間",
      url: `http://127.0.0.1:7327/?t=${FAKE_TOKEN_A}`,
      worktree: "tsukumo-6",
      branch: "tsukumo-6",
      ...overrides,
    }
  }

  test("見出しに部屋の名前が出る", () => {
    const html = buildRoomGridHtml([room()], RELOAD_HREF)
    expect(html).toContain("空色の間")
  })

  test("iframe の src に部屋の URL（トークン込み）を載せる", () => {
    const html = buildRoomGridHtml([room()], RELOAD_HREF)
    expect(html).toContain(`src="http://127.0.0.1:7327/?t=${FAKE_TOKEN_A}"`)
  })

  test("worktree・branch が無い部屋も、その欄を空けるだけで出る", () => {
    const html = buildRoomGridHtml([room({ worktree: undefined, branch: undefined })], RELOAD_HREF)
    expect(html).toContain("空色の間")
    expect(html).toContain("7327")
  })

  test("HTML の属性値はエスケープされる（部屋の名前に引用符・山括弧を含めても壊れない）", () => {
    const html = buildRoomGridHtml(
      [room({ worktree: `"><script>alert(1)</script>`, branch: "a&b" })],
      RELOAD_HREF,
    )
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("a&amp;b")
  })

  test("格子の HTML に <script> タグを置かない", () => {
    const html = buildRoomGridHtml([room()], RELOAD_HREF)
    expect(html).not.toContain("<script")
  })

  test("部屋が0件でも壊れず、並べる部屋が無いことを出す", () => {
    const html = buildRoomGridHtml([], RELOAD_HREF)
    expect(html).toContain("<title>")
    expect(html).toContain("並べる部屋が無い")
  })

  test("再読み込みは同じ格子の URL（鍵込み）へのリンクで、JS を使わない", () => {
    const html = buildRoomGridHtml([room()], RELOAD_HREF)
    expect(html).toContain(`<a class="room-grid-reload" href="${RELOAD_HREF}">`)
  })

  test("拡大の選択は再読み込みのあとに持ち越さない（ブラウザにフォームの状態を戻させない）", () => {
    const html = buildRoomGridHtml([room()], RELOAD_HREF)
    const radios = html.match(/<input [^>]*type="radio"[^>]*>/g) ?? []
    expect(radios.length).toBe(2)
    expect(radios.every((radio) => radio.includes(`autocomplete="off"`))).toBe(true)
  })
})

describe("previousGridTabs", () => {
  test("打ち直したときに閉じるのは、格子の題のタブだけ", () => {
    const tabs = [
      {
        pageId: "grid-old",
        url: `http://127.0.0.1:50123${ROOM_GRID_PATH}`,
        title: ROOM_GRID_TITLE,
      },
      { pageId: "room", url: `http://127.0.0.1:7327/?t=${FAKE_TOKEN_A}`, title: "tsukumo" },
    ]
    expect(previousGridTabs(tabs).map((tab) => tab.pageId)).toEqual(["grid-old"])
  })
})

describe("routeRoomGridRequest", () => {
  test("格子のパスへの GET で、鍵が合えば格子を返す", () => {
    expect(routeRoomGridRequest("GET", roomGridPath(FAKE_GRID_KEY), FAKE_GRID_KEY)).toBe("grid")
  })

  test("鍵が無ければ断る", () => {
    expect(routeRoomGridRequest("GET", ROOM_GRID_PATH, FAKE_GRID_KEY)).toBe("forbidden")
  })

  test("鍵が違えば断る", () => {
    expect(routeRoomGridRequest("GET", roomGridPath(FAKE_TOKEN_A), FAKE_GRID_KEY)).toBe("forbidden")
  })

  test("空の鍵は合わない", () => {
    expect(routeRoomGridRequest("GET", `${ROOM_GRID_PATH}?t=`, FAKE_GRID_KEY)).toBe("forbidden")
  })

  test("格子のパス以外は、鍵が合っていても見つからない扱い", () => {
    expect(routeRoomGridRequest("GET", `/?t=${FAKE_GRID_KEY}`, FAKE_GRID_KEY)).toBe("not-found")
  })

  test("GET 以外は見つからない扱い", () => {
    expect(routeRoomGridRequest("POST", roomGridPath(FAKE_GRID_KEY), FAKE_GRID_KEY)).toBe(
      "not-found",
    )
  })
})

describe("observeGridTab", () => {
  const initial: GridTabWatch = { absent: 0, failed: 0 }

  test("タブが見えていれば続ける", () => {
    expect(observeGridTab(initial, "present")).toEqual({ watch: initial, stop: false })
  })

  test("1回見えなかっただけでは終わらず、続けて見えなければ終わる", () => {
    const once = observeGridTab(initial, "absent")
    expect(once.stop).toBe(false)
    expect(observeGridTab(once.watch, "absent").stop).toBe(true)
  })

  test("間に見えた回が挟まると、見えなかった回の数え直しになる", () => {
    const once = observeGridTab(initial, "absent")
    const seen = observeGridTab(once.watch, "present")
    expect(observeGridTab(seen.watch, "absent").stop).toBe(false)
  })

  test("一覧が一時的に取れなかっただけでは終わらない", () => {
    const failed = observeGridTab(initial, "failed")
    expect(failed.stop).toBe(false)
    expect(observeGridTab(failed.watch, "present").stop).toBe(false)
  })

  test("一覧が長く取れ続けなければ（Orca が居なくなった）終わる", () => {
    const outcomes = Array.from({ length: 100 }).reduce<{
      readonly watch: GridTabWatch
      readonly stop: boolean
    }>((previous) => (previous.stop ? previous : observeGridTab(previous.watch, "failed")), {
      watch: initial,
      stop: false,
    })
    expect(outcomes.stop).toBe(true)
  })
})

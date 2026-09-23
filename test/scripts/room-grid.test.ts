// `scripts/room-grid.ts` の純粋関数（突き合わせ・HTML の組み立て）を検証する。lsof / orca / git は
// 一切起こさない（それは scripts/open-room-grid.ts の役目）。
//
// **フィクスチャの起動トークンはすべて架空の値**（docs/coding-standards.md「会話内容の扱い」）。

import { describe, expect, test } from "bun:test"

import type { Listener } from "../../scripts/lib/port-listener.ts"
import { buildRoomGridHtml, pickRooms, type Room, scanPorts } from "../../scripts/room-grid.ts"

const FAKE_TOKEN_A = "fake0000aaaa1111bbbb2222cccc3333"
const FAKE_TOKEN_B = "fake4444dddd5555eeee6666ffff7777"

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
    const html = buildRoomGridHtml([room()])
    expect(html).toContain("空色の間")
  })

  test("iframe の src に部屋の URL（トークン込み）を載せる", () => {
    const html = buildRoomGridHtml([room()])
    expect(html).toContain(`src="http://127.0.0.1:7327/?t=${FAKE_TOKEN_A}"`)
  })

  test("worktree・branch が無い部屋も、その欄を空けるだけで出る", () => {
    const html = buildRoomGridHtml([room({ worktree: undefined, branch: undefined })])
    expect(html).toContain("空色の間")
    expect(html).toContain("7327")
  })

  test("HTML の属性値はエスケープされる（部屋の名前に引用符・山括弧を含めても壊れない）", () => {
    const html = buildRoomGridHtml([
      room({ worktree: `"><script>alert(1)</script>`, branch: "a&b" }),
    ])
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
    expect(html).toContain("a&amp;b")
  })

  test("格子の HTML に <script> タグを置かない", () => {
    const html = buildRoomGridHtml([room()])
    expect(html).not.toContain("<script")
  })

  test("部屋が0件でも壊れない", () => {
    expect(buildRoomGridHtml([])).toContain("<title>")
  })
})

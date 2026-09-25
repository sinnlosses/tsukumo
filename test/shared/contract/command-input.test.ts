import { describe, expect, it } from "bun:test"

import {
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_TAGLINE_LENGTH,
} from "../../../src/shared/character-definition.ts"
import { MAX_CHARACTER_PACK_NAME_LENGTH } from "../../../src/shared/character.ts"
import { MAX_PROMPT_TEXT_LENGTH } from "../../../src/shared/contract/session.ts"
import { MAX_REMEMBERED_LINE_LENGTH } from "../../../src/shared/persona-memory.ts"
import { MAX_PORTRAIT_BYTES } from "../../../src/shared/portrait-image.ts"
import {
  MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH,
  MAX_PROMPT_IMAGES,
} from "../../../src/shared/prompt-image.ts"
import { commandContract } from "../../../src/shared/rpc.ts"

/** 手続きの名前（`session.prompt` のように機能と手続きを `.` で繋いだもの）→ 入力のスキーマ。 */
const INPUT_SCHEMAS = new Map(
  Object.entries(commandContract).flatMap(([feature, procedures]) =>
    Object.entries(procedures).map(
      ([name, procedure]) => [`${feature}.${name}`, procedure["~orpc"].inputSchema] as const,
    ),
  ),
)

/**
 * 契約の手続き1つの入力として検証する。通れば受け手が受け取る形（`default` を埋めたもの）、
 * 通らなければ undefined（入力の無い手続きは何でも通さない）。
 */
function parseInput(procedure: `${string}.${string}`, value: unknown): unknown {
  const schema = INPUT_SCHEMAS.get(procedure)
  if (schema === undefined) {
    return undefined
  }
  const parsed = schema.safeParse(value)
  return parsed.success ? parsed.data : undefined
}

// 立ち絵の代わりに使う、1バイトぶんの架空の data URL（中身は見ないので何でもよい）。
const TINY_PNG_DATA_URL = "data:image/png;base64,AAAA"

/** 依頼に添える画像1枚ぶん（原寸と控えの対）。**どちらも手で作った最小の data URL。** */
const TINY_PROMPT_IMAGE = { full: TINY_PNG_DATA_URL, thumbnail: TINY_PNG_DATA_URL }

/** 画像を `count` 枚添えた `prompt`（ほかの欄は通る形で固定する）。 */
function promptWithImages(images: readonly unknown[]): unknown {
  return { text: "架空の依頼", images }
}

/** id だけを差し替えた `characterPack.create`（ほかの欄は通る形で固定する）。 */
function createCharacter(id: string): unknown {
  return {
    id,
    name: "",
    portraits: { default: TINY_PNG_DATA_URL },
    accent: "#b8c7ff",
    chatAccent: "#eaa77a",
  }
}

// 文面はすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
describe("コマンドの契約の入力（受け付ける形）", () => {
  it("prompt を受け付ける", () => {
    expect(parseInput("session.prompt", { text: "架空の依頼" })).toEqual({
      text: "架空の依頼",
      // 画像を添えない依頼は、field ごと省いた形で届いて空に畳まれる。
      images: [],
    })
  })

  it("nudge・interrupt は入力を持たない（押した事実だけが届く）", () => {
    // **文面の欄が無い**のが nudge の形そのもの（送る一言は
    // `src/server/chat/core/chat-nudge.ts` が持つ。docs/screen-design.md 13.7）。
    expect(INPUT_SCHEMAS.get("session.nudge")).toBeUndefined()
    expect(INPUT_SCHEMAS.get("session.interrupt")).toBeUndefined()
  })

  it("answer・setModel・setPermissionMode を受け付ける", () => {
    expect(
      parseInput("session.answer", {
        id: "toolu_1",
        answer: { kind: "answers", labels: [["こっち"]] },
      }),
    ).toEqual({
      id: "toolu_1",
      answer: { kind: "answers", labels: [["こっち"]] },
    })
    for (const answer of [{ kind: "allow" }, { kind: "deny" }] as const) {
      expect(parseInput("session.answer", { id: "toolu_1", answer })).toEqual({
        id: "toolu_1",
        answer,
      })
    }
    expect(parseInput("session.setModel", { model: "opus" })).toEqual({
      model: "opus",
    })
    expect(parseInput("session.setPermissionMode", { mode: "plan" })).toEqual({ mode: "plan" })
  })

  it("session.setEffort を受け付ける（session.setModel と同じ形）", () => {
    expect(parseInput("session.setEffort", { effort: "high" })).toEqual({
      effort: "high",
    })
  })

  it("chat.forgetRememberedLine は消したい1行の文面をそのまま受け付ける", () => {
    expect(parseInput("chat.forgetRememberedLine", { line: "架空の覚えたこと" })).toEqual({
      line: "架空の覚えたこと",
    })
  })

  it("host.openFile はパスをそのまま受け付ける", () => {
    expect(parseInput("host.openFile", { path: "src/foo.ts" })).toEqual({ path: "src/foo.ts" })
  })

  it("session.reflectAchievement は日付をそのまま受け付ける", () => {
    expect(parseInput("session.reflectAchievement", { date: "2026-09-23" })).toEqual({
      date: "2026-09-23",
    })
  })

  it("session.reflectAchievement は YYYY-MM-DD の形でない日付を拒む", () => {
    expect(parseInput("session.reflectAchievement", { date: "9/23" })).toBeUndefined()
    expect(parseInput("session.reflectAchievement", { date: "" })).toBeUndefined()
  })

  it("visit.setEnabled は真偽値をそのまま受け付ける", () => {
    expect(parseInput("visit.setEnabled", { enabled: false })).toEqual({ enabled: false })
    expect(parseInput("visit.setEnabled", { enabled: true })).toEqual({ enabled: true })
  })

  it("visit.setEnabled は真偽値でない enabled を拒む", () => {
    expect(parseInput("visit.setEnabled", { enabled: "yes" })).toBeUndefined()
  })
})

describe("コマンドの契約の入力（キャラクターの見た目）", () => {
  it("characterPack.setPortrait は表情と data URL を受け付ける", () => {
    expect(
      parseInput("characterPack.setPortrait", {
        pack: "fictional",
        expression: "proud",
        image: TINY_PNG_DATA_URL,
      }),
    ).toEqual({
      pack: "fictional",
      expression: "proud",
      image: TINY_PNG_DATA_URL,
    })
  })

  it("characterPack.setOutfitAccent は衣装と16進の色を受け付ける", () => {
    expect(
      parseInput("characterPack.setOutfitAccent", {
        pack: "fictional",
        outfit: "heavy",
        color: "#ffb3a7",
      }),
    ).toEqual({
      pack: "fictional",
      outfit: "heavy",
      color: "#ffb3a7",
    })
  })

  it("characterPack.setAccent は target（work / chat）と16進の色を受け付ける", () => {
    expect(
      parseInput("characterPack.setAccent", {
        pack: "fictional",
        target: "work",
        color: "#f2b0a0",
      }),
    ).toEqual({
      pack: "fictional",
      target: "work",
      color: "#f2b0a0",
    })
    expect(
      parseInput("characterPack.setAccent", {
        pack: "fictional",
        target: "chat",
        color: "#f2984a",
      }),
    ).toEqual({
      pack: "fictional",
      target: "chat",
      color: "#f2984a",
    })
  })

  it("characterPack.setAccent は知らない target・16進でない色を受け付けない", () => {
    expect(
      parseInput("characterPack.setAccent", {
        pack: "fictional",
        target: "battle",
        color: "#f2b0a0",
      }),
    ).toBeUndefined()
    expect(
      parseInput("characterPack.setAccent", {
        pack: "fictional",
        target: "work",
        color: "rebeccapurple",
      }),
    ).toBeUndefined()
  })

  it("characterPack.clearChatAccent を受け付ける（書き込む先のパックだけでよい）", () => {
    expect(parseInput("characterPack.clearChatAccent", { pack: "fictional" })).toEqual({
      pack: "fictional",
    })
  })

  // **使用中を暗黙にしない**（`docs/design.md` 7.1）。書き込む先のディレクトリ名になる値なので、
  // 作るときと同じ形の検査を通す。
  it("見た目の編集は書き込む先のパックが無い・パックの名前として通らない形なら undefined", () => {
    expect(parseInput("characterPack.clearBackground", {})).toBeUndefined()
    for (const pack of ["", "..", "../fictional", "fictional/other", ".hidden", "架空"]) {
      expect(parseInput("characterPack.clearBackground", { pack })).toBeUndefined()
    }
    expect(parseInput("characterPack.clearBackground", { pack: "fictional-2" })).toEqual({
      pack: "fictional-2",
    })
  })

  it("characterPack.setFace / characterPack.clearFace は書き込む先のパックと data URL を受け付ける", () => {
    expect(
      parseInput("characterPack.setFace", { pack: "fictional", image: TINY_PNG_DATA_URL }),
    ).toEqual({
      pack: "fictional",
      image: TINY_PNG_DATA_URL,
    })
    expect(parseInput("characterPack.clearFace", { pack: "fictional" })).toEqual({
      pack: "fictional",
    })
    // 立ち絵と同じ形式だけを受け付ける（背景の形式・写真の URL は弾く）。
    expect(
      parseInput("characterPack.setFace", {
        pack: "fictional",
        image: "https://example.com/face.png",
      }),
    ).toBeUndefined()
  })

  it("characterPack.clearPortrait は必須でない表情（thinking / proud / flustered）だけを受け付ける", () => {
    expect(
      parseInput("characterPack.clearPortrait", { pack: "fictional", expression: "thinking" }),
    ).toEqual({
      pack: "fictional",
      expression: "thinking",
    })
    expect(
      parseInput("characterPack.clearPortrait", { pack: "fictional", expression: "proud" }),
    ).toEqual({ pack: "fictional", expression: "proud" })
    expect(
      parseInput("characterPack.clearPortrait", { pack: "fictional", expression: "flustered" }),
    ).toBeDefined()
  })

  // **必須の1つ（`docs/requirements.md` 4.4 / characters/README.md）を消す操作は境界で弾く。**
  it("characterPack.clearPortrait で default を消そうとすると undefined（必須は消せない）", () => {
    expect(
      parseInput("characterPack.clearPortrait", { pack: "fictional", expression: "default" }),
    ).toBeUndefined()
  })

  it("知らない表情・衣装、16進でない色、data URL でない画像は undefined", () => {
    expect(
      parseInput("characterPack.setPortrait", {
        pack: "fictional",
        expression: "angry",
        image: TINY_PNG_DATA_URL,
      }),
    ).toBeUndefined()
    expect(
      parseInput("characterPack.setPortrait", {
        pack: "fictional",
        expression: "proud",
        image: "https://example.com/portrait.png",
      }),
    ).toBeUndefined()
    expect(
      parseInput("characterPack.setOutfitAccent", {
        pack: "fictional",
        outfit: "battle",
        color: "#ffb3a7",
      }),
    ).toBeUndefined()
    expect(
      parseInput("characterPack.setOutfitAccent", {
        pack: "fictional",
        outfit: "heavy",
        color: "rebeccapurple",
      }),
    ).toBeUndefined()
  })

  it("上限を超えた大きさの立ち絵は undefined", () => {
    const tooLarge = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_PORTRAIT_BYTES / 3) * 4) + 8)}`

    expect(
      parseInput("characterPack.setPortrait", {
        pack: "fictional",
        expression: "proud",
        image: tooLarge,
      }),
    ).toBeUndefined()
  })

  it("characterPack.create を受け付ける（id・名前・必須の1枚・仕事と雑談の差し色が揃った形）", () => {
    expect(
      parseInput("characterPack.create", {
        id: "fictional-2",
        name: "架空の2号",
        portraits: { default: TINY_PNG_DATA_URL },
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toEqual({
      id: "fictional-2",
      name: "架空の2号",
      portraits: { default: TINY_PNG_DATA_URL },
      accent: "#b8c7ff",
      chatAccent: "#eaa77a",
    })
  })

  it("characterPack.create の名前は空文字でも受け付ける（空なら書き込む側が id へ落とす）", () => {
    expect(
      parseInput("characterPack.create", {
        id: "fictional-2",
        name: "",
        portraits: { default: TINY_PNG_DATA_URL },
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toMatchObject({ name: "" })
  })

  it("characterPack.setProfile を受け付ける（対象のパック名・名前・ひとことプロフィール）", () => {
    expect(
      parseInput("characterPack.setProfile", {
        pack: "fictional",
        name: "架空の精霊",
        tagline: "ひとこと",
      }),
    ).toEqual({
      pack: "fictional",
      name: "架空の精霊",
      tagline: "ひとこと",
    })
  })

  it("characterPack.setProfile の名前・ひとことは空文字でも受け付ける（空なら消えたのと同じに畳む）", () => {
    expect(
      parseInput("characterPack.setProfile", { pack: "fictional", name: "", tagline: "" }),
    ).toEqual({ pack: "fictional", name: "", tagline: "" })
  })

  it("characterPack.setProfile は名前・ひとことが長すぎると undefined、パックの名前がパスになると undefined", () => {
    expect(
      parseInput("characterPack.setProfile", {
        pack: "fictional",
        name: "あ".repeat(MAX_CHARACTER_NAME_LENGTH + 1),
        tagline: "ひとこと",
      }),
    ).toBeUndefined()
    expect(
      parseInput("characterPack.setProfile", {
        pack: "fictional",
        name: "架空",
        tagline: "あ".repeat(MAX_CHARACTER_TAGLINE_LENGTH + 1),
      }),
    ).toBeUndefined()
    expect(
      parseInput("characterPack.setProfile", {
        pack: "../escape",
        name: "架空",
        tagline: "ひとこと",
      }),
    ).toBeUndefined()
  })

  it("session.switchSession を受け付ける（空のIDは弾く）", () => {
    expect(parseInput("session.switchSession", { sessionId: "s-架空" })).toEqual({
      sessionId: "s-架空",
    })
    expect(parseInput("session.switchSession", { sessionId: "" })).toBeUndefined()
    expect(parseInput("session.switchSession", {})).toBeUndefined()
  })
})

describe("コマンドの契約の入力（依頼に添える画像）", () => {
  it("上限の枚数までは、原寸と控えの対をそのまま通す", () => {
    const images = Array.from({ length: MAX_PROMPT_IMAGES }, () => TINY_PROMPT_IMAGE)

    expect(parseInput("session.prompt", promptWithImages(images))).toEqual({
      text: "架空の依頼",
      images,
    })
  })

  it("枚数が上限を超えたら undefined（1枚だけ落とさず、コマンドごと受け付けない）", () => {
    const tooMany = Array.from({ length: MAX_PROMPT_IMAGES + 1 }, () => TINY_PROMPT_IMAGE)

    expect(parseInput("session.prompt", promptWithImages(tooMany))).toBeUndefined()
  })

  it("受け付けない形式は undefined（`.svg` は API が取らないので渡せない）", () => {
    const svg = "data:image/svg+xml;base64,AAAA"

    expect(
      parseInput("session.prompt", promptWithImages([{ full: svg, thumbnail: svg }])),
    ).toBeUndefined()
    expect(
      parseInput("session.prompt", promptWithImages([{ full: svg, thumbnail: TINY_PNG_DATA_URL }])),
    ).toBeUndefined()
  })

  it("data URL でない値・対の片側が欠けた形は undefined", () => {
    expect(parseInput("session.prompt", promptWithImages(["架空の文字列"]))).toBeUndefined()
    expect(
      parseInput("session.prompt", promptWithImages([{ full: TINY_PNG_DATA_URL }])),
    ).toBeUndefined()
    expect(
      parseInput("session.prompt", promptWithImages([{ thumbnail: TINY_PNG_DATA_URL }])),
    ).toBeUndefined()
  })

  it("控えが大きすぎる依頼は undefined（記録に残るのは控えなので、原寸より厳しく見る）", () => {
    const tooLargeThumbnail = `data:image/png;base64,${"A".repeat(
      MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH,
    )}`

    expect(
      parseInput(
        "session.prompt",
        promptWithImages([{ full: TINY_PNG_DATA_URL, thumbnail: tooLargeThumbnail }]),
      ),
    ).toBeUndefined()
  })
})

describe("コマンドの契約の入力（落とす形）", () => {
  it("空白だけの依頼と、上限を超えた依頼は undefined", () => {
    expect(parseInput("session.prompt", { text: "   " })).toBeUndefined()
    expect(
      parseInput("session.prompt", { text: "あ".repeat(MAX_PROMPT_TEXT_LENGTH + 1) }),
    ).toBeUndefined()
  })

  // **名前はディレクトリ名になる**ので、パスの区切りと `..` を通さない（docs/design.md 7.1）。
  it("パックの区切り・`..`・隠しディレクトリになる名前では、新しいパックを作らせない", () => {
    const rejected = [
      "../escape",
      "..",
      ".hidden",
      "nested/name",
      "back\\slash",
      "空白 入り",
      "日本語",
      "",
      "a".repeat(MAX_CHARACTER_PACK_NAME_LENGTH + 1),
    ]

    for (const name of rejected) {
      expect(parseInput("characterPack.create", createCharacter(name))).toBeUndefined()
    }
    // 半角の英数字と `.` `_` `-` だけなら通る（`.` で始まらないこと）。
    expect(parseInput("characterPack.create", createCharacter("my_pack-2.0"))).toBeDefined()
  })

  it("characterPack.delete はパックの名前だけを受け付け、パスになる名前は通さない", () => {
    expect(parseInput("characterPack.delete", { pack: "fictional-2" })).toEqual({
      pack: "fictional-2",
    })

    for (const pack of ["../escape", "..", ".hidden", "nested/name", ""]) {
      expect(parseInput("characterPack.delete", { pack })).toBeUndefined()
    }
  })

  // **`default` はここで required**（欠けたパックが書き込む側まで届かない）。
  it("必須の立ち絵が欠けた characterPack.create は undefined", () => {
    expect(
      parseInput("characterPack.create", {
        id: "fictional-2",
        name: "",
        portraits: {},
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toBeUndefined()
  })

  it("必須の立ち絵が data URL でない characterPack.create は undefined", () => {
    expect(
      parseInput("characterPack.create", {
        id: "fictional-2",
        name: "",
        portraits: { default: "data:text/plain;base64,AAAA" },
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toBeUndefined()
  })

  it("雑談の差し色が欠けた characterPack.create は undefined（両方 required）", () => {
    expect(
      parseInput("characterPack.create", {
        id: "fictional-2",
        name: "",
        portraits: { default: TINY_PNG_DATA_URL },
        accent: "#b8c7ff",
      }),
    ).toBeUndefined()
  })

  it("空の行と、上限を超えた行を持つ chat.forgetRememberedLine は undefined", () => {
    expect(parseInput("chat.forgetRememberedLine", { line: "" })).toBeUndefined()
    expect(
      parseInput("chat.forgetRememberedLine", {
        line: "あ".repeat(MAX_REMEMBERED_LINE_LENGTH + 1),
      }),
    ).toBeUndefined()
  })

  it("空の path を持つ host.openFile は undefined", () => {
    expect(parseInput("host.openFile", { path: "" })).toBeUndefined()
  })

  it("一覧に無いモデル・許可モード、形の合わない答えは undefined", () => {
    expect(parseInput("session.setModel", { model: "gpt" })).toBeUndefined()
    expect(parseInput("session.setPermissionMode", { mode: "dontAsk" })).toBeUndefined()
    expect(parseInput("session.setEffort", { effort: "ultra" })).toBeUndefined()
    expect(parseInput("session.answer", { id: "toolu_1", answer: { kind: "??" } })).toBeUndefined()
  })

  it("answers の labels が「文字列の配列」の配列でない答えは undefined", () => {
    for (const answer of [
      { kind: "answers", labels: [1, 2] },
      { kind: "answers", labels: ["答え"] },
      { kind: "answers", labels: "答え" },
      { kind: "answers" },
    ]) {
      expect(parseInput("session.answer", { id: "toolu_1", answer })).toBeUndefined()
    }
  })
})

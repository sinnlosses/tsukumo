import { describe, expect, it } from "bun:test"

import {
  MAX_CHARACTER_NAME_LENGTH,
  MAX_CHARACTER_TAGLINE_LENGTH,
} from "../../src/shared/character-definition.ts"
import { MAX_CHARACTER_PACK_NAME_LENGTH } from "../../src/shared/character.ts"
import {
  isCharacterEditCommand,
  MAX_PROMPT_TEXT_LENGTH,
  parseClientCommand,
} from "../../src/shared/command.ts"
import { MAX_REMEMBERED_LINE_LENGTH } from "../../src/shared/persona-memory.ts"
import { MAX_PORTRAIT_BYTES } from "../../src/shared/portrait-image.ts"
import {
  MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH,
  MAX_PROMPT_IMAGES,
} from "../../src/shared/prompt-image.ts"

// 立ち絵の代わりに使う、1バイトぶんの架空の data URL（中身は見ないので何でもよい）。
const TINY_PNG_DATA_URL = "data:image/png;base64,AAAA"

/** 依頼に添える画像1枚ぶん（原寸と控えの対）。**どちらも手で作った最小の data URL。** */
const TINY_PROMPT_IMAGE = { full: TINY_PNG_DATA_URL, thumbnail: TINY_PNG_DATA_URL }

/** 画像を `count` 枚添えた `prompt`（ほかの欄は通る形で固定する）。 */
function promptWithImages(images: readonly unknown[]): unknown {
  return { type: "prompt", commandId: "c-1", text: "架空の依頼", images }
}

/** id だけを差し替えた `create-character`（ほかの欄は通る形で固定する）。 */
function createCharacter(id: string): unknown {
  return {
    type: "create-character",
    commandId: "c-1",
    id,
    name: "",
    portraits: { default: TINY_PNG_DATA_URL },
    accent: "#b8c7ff",
    chatAccent: "#eaa77a",
  }
}

// 文面はすべて手で書いた架空のもの（docs/coding-standards.md「会話内容の扱い」）。
describe("parseClientCommand（受け付ける形）", () => {
  it("prompt を受け付ける", () => {
    expect(parseClientCommand({ type: "prompt", commandId: "c-1", text: "架空の依頼" })).toEqual({
      type: "prompt",
      commandId: "c-1",
      text: "架空の依頼",
      // 画像を添えない依頼は、field ごと省いた形で届いて空に畳まれる。
      images: [],
    })
  })

  it("nudge を受け付ける（話しかけてもらう合図。文面は持たない）", () => {
    // **文面の欄が無い**のがこのコマンドの形そのもの（送る一言は
    // `src/server/core/chat-nudge.ts` が持つ。docs/screen-design.md 13.7）。
    expect(parseClientCommand({ type: "nudge", commandId: "c-9" })).toEqual({
      type: "nudge",
      commandId: "c-9",
    })
  })

  it("interrupt・answer・set-model・set-permission-mode を受け付ける", () => {
    expect(parseClientCommand({ type: "interrupt", commandId: "c-2" })).toEqual({
      type: "interrupt",
      commandId: "c-2",
    })
    expect(
      parseClientCommand({
        type: "answer",
        commandId: "c-3",
        id: "toolu_1",
        answer: { kind: "answers", labels: [["こっち"]] },
      }),
    ).toEqual({
      type: "answer",
      commandId: "c-3",
      id: "toolu_1",
      answer: { kind: "answers", labels: [["こっち"]] },
    })
    expect(parseClientCommand({ type: "set-model", commandId: "c-4", model: "opus" })).toEqual({
      type: "set-model",
      commandId: "c-4",
      model: "opus",
    })
    expect(
      parseClientCommand({ type: "set-permission-mode", commandId: "c-5", mode: "plan" }),
    ).toEqual({ type: "set-permission-mode", commandId: "c-5", mode: "plan" })
  })

  it("forget-remembered-line は消したい1行の文面をそのまま受け付ける", () => {
    expect(
      parseClientCommand({
        type: "forget-remembered-line",
        commandId: "c-6",
        line: "架空の覚えたこと",
      }),
    ).toEqual({ type: "forget-remembered-line", commandId: "c-6", line: "架空の覚えたこと" })
  })

  it("open-file はパスをそのまま受け付ける", () => {
    expect(parseClientCommand({ type: "open-file", commandId: "c-7", path: "src/foo.ts" })).toEqual(
      { type: "open-file", commandId: "c-7", path: "src/foo.ts" },
    )
  })

  it("reflect-achievement は日付をそのまま受け付ける", () => {
    expect(
      parseClientCommand({ type: "reflect-achievement", commandId: "c-8", date: "2026-09-23" }),
    ).toEqual({ type: "reflect-achievement", commandId: "c-8", date: "2026-09-23" })
  })

  it("reflect-achievement は YYYY-MM-DD の形でない日付を拒む", () => {
    expect(
      parseClientCommand({ type: "reflect-achievement", commandId: "c-8", date: "9/23" }),
    ).toBeUndefined()
    expect(
      parseClientCommand({ type: "reflect-achievement", commandId: "c-8", date: "" }),
    ).toBeUndefined()
  })
})

describe("parseClientCommand（キャラクターの見た目）", () => {
  it("set-portrait は表情と data URL を受け付ける", () => {
    expect(
      parseClientCommand({
        type: "set-portrait",
        commandId: "c-6",
        pack: "fictional",
        expression: "proud",
        image: TINY_PNG_DATA_URL,
      }),
    ).toEqual({
      type: "set-portrait",
      commandId: "c-6",
      pack: "fictional",
      expression: "proud",
      image: TINY_PNG_DATA_URL,
    })
  })

  it("set-outfit-accent は衣装と16進の色を受け付ける", () => {
    expect(
      parseClientCommand({
        type: "set-outfit-accent",
        commandId: "c-7",
        pack: "fictional",
        outfit: "heavy",
        color: "#ffb3a7",
      }),
    ).toEqual({
      type: "set-outfit-accent",
      commandId: "c-7",
      pack: "fictional",
      outfit: "heavy",
      color: "#ffb3a7",
    })
  })

  it("set-accent は target（work / chat）と16進の色を受け付ける", () => {
    expect(
      parseClientCommand({
        type: "set-accent",
        commandId: "c-7",
        pack: "fictional",
        target: "work",
        color: "#f2b0a0",
      }),
    ).toEqual({
      type: "set-accent",
      commandId: "c-7",
      pack: "fictional",
      target: "work",
      color: "#f2b0a0",
    })
    expect(
      parseClientCommand({
        type: "set-accent",
        commandId: "c-7",
        pack: "fictional",
        target: "chat",
        color: "#f2984a",
      }),
    ).toEqual({
      type: "set-accent",
      commandId: "c-7",
      pack: "fictional",
      target: "chat",
      color: "#f2984a",
    })
  })

  it("set-accent は知らない target・16進でない色を受け付けない", () => {
    expect(
      parseClientCommand({
        type: "set-accent",
        commandId: "c-7",
        pack: "fictional",
        target: "battle",
        color: "#f2b0a0",
      }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "set-accent",
        commandId: "c-7",
        pack: "fictional",
        target: "work",
        color: "rebeccapurple",
      }),
    ).toBeUndefined()
  })

  it("clear-chat-accent を受け付ける（commandId と書き込む先のパックだけでよい）", () => {
    expect(
      parseClientCommand({ type: "clear-chat-accent", commandId: "c-7", pack: "fictional" }),
    ).toEqual({
      type: "clear-chat-accent",
      commandId: "c-7",
      pack: "fictional",
    })
  })

  // **使用中を暗黙にしない**（`docs/design.md` 7.1）。書き込む先のディレクトリ名になる値なので、
  // 作るときと同じ形の検査を通す。
  it("見た目の編集は書き込む先のパックが無い・パックの名前として通らない形なら undefined", () => {
    expect(parseClientCommand({ type: "clear-background", commandId: "c-9" })).toBeUndefined()
    for (const pack of ["", "..", "../fictional", "fictional/other", ".hidden", "架空"]) {
      expect(
        parseClientCommand({ type: "clear-background", commandId: "c-9", pack }),
      ).toBeUndefined()
    }
    expect(
      parseClientCommand({ type: "clear-background", commandId: "c-9", pack: "fictional-2" }),
    ).toEqual({ type: "clear-background", commandId: "c-9", pack: "fictional-2" })
  })

  it("set-face / clear-face は書き込む先のパックと data URL を受け付ける", () => {
    expect(
      parseClientCommand({
        type: "set-face",
        commandId: "c-10",
        pack: "fictional",
        image: TINY_PNG_DATA_URL,
      }),
    ).toEqual({
      type: "set-face",
      commandId: "c-10",
      pack: "fictional",
      image: TINY_PNG_DATA_URL,
    })
    expect(
      parseClientCommand({ type: "clear-face", commandId: "c-11", pack: "fictional" }),
    ).toEqual({ type: "clear-face", commandId: "c-11", pack: "fictional" })
    // 立ち絵と同じ形式だけを受け付ける（背景の形式・写真の URL は弾く）。
    expect(
      parseClientCommand({
        type: "set-face",
        commandId: "c-12",
        pack: "fictional",
        image: "https://example.com/face.png",
      }),
    ).toBeUndefined()
  })

  it("clear-portrait は必須でない表情（thinking / proud / flustered）だけを受け付ける", () => {
    expect(
      parseClientCommand({
        type: "clear-portrait",
        commandId: "c-8",
        pack: "fictional",
        expression: "thinking",
      }),
    ).toEqual({
      type: "clear-portrait",
      commandId: "c-8",
      pack: "fictional",
      expression: "thinking",
    })
    expect(
      parseClientCommand({
        type: "clear-portrait",
        commandId: "c-8",
        pack: "fictional",
        expression: "proud",
      }),
    ).toEqual({ type: "clear-portrait", commandId: "c-8", pack: "fictional", expression: "proud" })
    expect(
      parseClientCommand({
        type: "clear-portrait",
        commandId: "c-8",
        pack: "fictional",
        expression: "flustered",
      }),
    ).toBeDefined()
  })

  // **必須の1つ（`docs/requirements.md` 4.4 / characters/README.md）を消す操作は境界で弾く。**
  it("clear-portrait で default を消そうとすると undefined（必須は消せない）", () => {
    expect(
      parseClientCommand({
        type: "clear-portrait",
        commandId: "c-8",
        pack: "fictional",
        expression: "default",
      }),
    ).toBeUndefined()
  })

  it("知らない表情・衣装、16進でない色、data URL でない画像は undefined", () => {
    expect(
      parseClientCommand({
        type: "set-portrait",
        commandId: "c-6",
        pack: "fictional",
        expression: "angry",
        image: TINY_PNG_DATA_URL,
      }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "set-portrait",
        commandId: "c-6",
        pack: "fictional",
        expression: "proud",
        image: "https://example.com/portrait.png",
      }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "set-outfit-accent",
        commandId: "c-7",
        pack: "fictional",
        outfit: "battle",
        color: "#ffb3a7",
      }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "set-outfit-accent",
        commandId: "c-7",
        pack: "fictional",
        outfit: "heavy",
        color: "rebeccapurple",
      }),
    ).toBeUndefined()
  })

  it("上限を超えた大きさの立ち絵は undefined", () => {
    const tooLarge = `data:image/png;base64,${"A".repeat(Math.ceil((MAX_PORTRAIT_BYTES / 3) * 4) + 8)}`

    expect(
      parseClientCommand({
        type: "set-portrait",
        commandId: "c-6",
        pack: "fictional",
        expression: "proud",
        image: tooLarge,
      }),
    ).toBeUndefined()
  })

  it("create-character を受け付ける（id・名前・必須の1枚・仕事と雑談の差し色が揃った形）", () => {
    expect(
      parseClientCommand({
        type: "create-character",
        commandId: "c-1",
        id: "fictional-2",
        name: "架空の2号",
        portraits: { default: TINY_PNG_DATA_URL },
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toEqual({
      type: "create-character",
      commandId: "c-1",
      id: "fictional-2",
      name: "架空の2号",
      portraits: { default: TINY_PNG_DATA_URL },
      accent: "#b8c7ff",
      chatAccent: "#eaa77a",
    })
  })

  it("create-character の名前は空文字でも受け付ける（空なら書き込む側が id へ落とす）", () => {
    expect(
      parseClientCommand({
        type: "create-character",
        commandId: "c-1",
        id: "fictional-2",
        name: "",
        portraits: { default: TINY_PNG_DATA_URL },
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toMatchObject({ name: "" })
  })

  it("set-profile を受け付ける（対象のパック名・名前・ひとことプロフィール）", () => {
    expect(
      parseClientCommand({
        type: "set-profile",
        commandId: "c-1",
        pack: "fictional",
        name: "架空の精霊",
        tagline: "ひとこと",
      }),
    ).toEqual({
      type: "set-profile",
      commandId: "c-1",
      pack: "fictional",
      name: "架空の精霊",
      tagline: "ひとこと",
    })
  })

  it("set-profile の名前・ひとことは空文字でも受け付ける（空なら消えたのと同じに畳む）", () => {
    expect(
      parseClientCommand({
        type: "set-profile",
        commandId: "c-1",
        pack: "fictional",
        name: "",
        tagline: "",
      }),
    ).toEqual({ type: "set-profile", commandId: "c-1", pack: "fictional", name: "", tagline: "" })
  })

  it("set-profile は名前・ひとことが長すぎると undefined、パックの名前がパスになると undefined", () => {
    expect(
      parseClientCommand({
        type: "set-profile",
        commandId: "c-1",
        pack: "fictional",
        name: "あ".repeat(MAX_CHARACTER_NAME_LENGTH + 1),
        tagline: "ひとこと",
      }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "set-profile",
        commandId: "c-1",
        pack: "fictional",
        name: "架空",
        tagline: "あ".repeat(MAX_CHARACTER_TAGLINE_LENGTH + 1),
      }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "set-profile",
        commandId: "c-1",
        pack: "../escape",
        name: "架空",
        tagline: "ひとこと",
      }),
    ).toBeUndefined()
  })

  it("switch-session を受け付ける（空のIDは弾く）", () => {
    expect(
      parseClientCommand({ type: "switch-session", commandId: "c-1", sessionId: "s-架空" }),
    ).toEqual({ type: "switch-session", commandId: "c-1", sessionId: "s-架空" })
    expect(
      parseClientCommand({ type: "switch-session", commandId: "c-2", sessionId: "" }),
    ).toBeUndefined()
    expect(parseClientCommand({ type: "switch-session", commandId: "c-3" })).toBeUndefined()
  })

  it("isCharacterEditCommand が見た目の編集とプロフィールの編集だけを true にする", () => {
    const edits = [
      {
        type: "set-portrait",
        commandId: "c-1",
        pack: "fictional",
        expression: "proud",
        image: TINY_PNG_DATA_URL,
      },
      { type: "clear-portrait", commandId: "c-2", pack: "fictional", expression: "proud" },
      {
        type: "set-outfit-accent",
        commandId: "c-3",
        pack: "fictional",
        outfit: "light",
        color: "#a8e6c0",
      },
      { type: "set-accent", commandId: "c-7", pack: "fictional", target: "work", color: "#f2b0a0" },
      { type: "clear-chat-accent", commandId: "c-8", pack: "fictional" },
      {
        type: "set-profile",
        commandId: "c-9",
        pack: "fictional",
        name: "架空",
        tagline: "ひとこと",
      },
      {
        type: "set-face",
        commandId: "c-10",
        pack: "fictional",
        image: TINY_PNG_DATA_URL,
      },
      { type: "clear-face", commandId: "c-11", pack: "fictional" },
    ]
    const others = [
      { type: "interrupt", commandId: "c-4" },
      { type: "switch-character", commandId: "c-5", name: "tsukumo" },
      { type: "switch-session", commandId: "c-6", sessionId: "s-架空" },
    ]

    for (const value of edits) {
      const command = parseClientCommand(value)
      expect(command !== undefined && isCharacterEditCommand(command)).toBe(true)
    }
    for (const value of others) {
      const command = parseClientCommand(value)
      expect(command !== undefined && isCharacterEditCommand(command)).toBe(false)
    }
  })
})

describe("parseClientCommand（依頼に添える画像）", () => {
  it("上限の枚数までは、原寸と控えの対をそのまま通す", () => {
    const images = Array.from({ length: MAX_PROMPT_IMAGES }, () => TINY_PROMPT_IMAGE)

    expect(parseClientCommand(promptWithImages(images))).toEqual({
      type: "prompt",
      commandId: "c-1",
      text: "架空の依頼",
      images,
    })
  })

  it("枚数が上限を超えたら undefined（1枚だけ落とさず、コマンドごと受け付けない）", () => {
    const tooMany = Array.from({ length: MAX_PROMPT_IMAGES + 1 }, () => TINY_PROMPT_IMAGE)

    expect(parseClientCommand(promptWithImages(tooMany))).toBeUndefined()
  })

  it("受け付けない形式は undefined（`.svg` は API が取らないので渡せない）", () => {
    const svg = "data:image/svg+xml;base64,AAAA"

    expect(parseClientCommand(promptWithImages([{ full: svg, thumbnail: svg }]))).toBeUndefined()
    expect(
      parseClientCommand(promptWithImages([{ full: svg, thumbnail: TINY_PNG_DATA_URL }])),
    ).toBeUndefined()
  })

  it("data URL でない値・対の片側が欠けた形は undefined", () => {
    expect(parseClientCommand(promptWithImages(["架空の文字列"]))).toBeUndefined()
    expect(parseClientCommand(promptWithImages([{ full: TINY_PNG_DATA_URL }]))).toBeUndefined()
    expect(parseClientCommand(promptWithImages([{ thumbnail: TINY_PNG_DATA_URL }]))).toBeUndefined()
  })

  it("控えが大きすぎる依頼は undefined（記録に残るのは控えなので、原寸より厳しく見る）", () => {
    const tooLargeThumbnail = `data:image/png;base64,${"A".repeat(
      MAX_PROMPT_IMAGE_THUMBNAIL_DATA_URL_LENGTH,
    )}`

    expect(
      parseClientCommand(
        promptWithImages([{ full: TINY_PNG_DATA_URL, thumbnail: tooLargeThumbnail }]),
      ),
    ).toBeUndefined()
  })
})

describe("parseClientCommand（落とす形）", () => {
  it("知らない type・commandId の無い形は undefined", () => {
    expect(parseClientCommand({ type: "shout", commandId: "c-1", text: "あ" })).toBeUndefined()
    expect(parseClientCommand({ type: "prompt", text: "架空の依頼" })).toBeUndefined()
    expect(parseClientCommand("prompt")).toBeUndefined()
    expect(parseClientCommand(undefined)).toBeUndefined()
  })

  it("空白だけの依頼と、上限を超えた依頼は undefined", () => {
    expect(parseClientCommand({ type: "prompt", commandId: "c-1", text: "   " })).toBeUndefined()
    expect(
      parseClientCommand({
        type: "prompt",
        commandId: "c-1",
        text: "あ".repeat(MAX_PROMPT_TEXT_LENGTH + 1),
      }),
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
      expect(parseClientCommand(createCharacter(name))).toBeUndefined()
    }
    // 半角の英数字と `.` `_` `-` だけなら通る（`.` で始まらないこと）。
    expect(parseClientCommand(createCharacter("my_pack-2.0"))).toBeDefined()
  })

  it("delete-character はパックの名前だけを受け付け、パスになる名前は通さない", () => {
    expect(
      parseClientCommand({ type: "delete-character", commandId: "c-1", pack: "fictional-2" }),
    ).toEqual({ type: "delete-character", commandId: "c-1", pack: "fictional-2" })

    for (const pack of ["../escape", "..", ".hidden", "nested/name", ""]) {
      expect(
        parseClientCommand({ type: "delete-character", commandId: "c-1", pack }),
      ).toBeUndefined()
    }
  })

  // **`default` はここで required**（欠けたパックが書き込む側まで届かない）。
  it("必須の立ち絵が欠けた create-character は undefined", () => {
    expect(
      parseClientCommand({
        type: "create-character",
        commandId: "c-1",
        id: "fictional-2",
        name: "",
        portraits: {},
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toBeUndefined()
  })

  it("必須の立ち絵が data URL でない create-character は undefined", () => {
    expect(
      parseClientCommand({
        type: "create-character",
        commandId: "c-1",
        id: "fictional-2",
        name: "",
        portraits: { default: "data:text/plain;base64,AAAA" },
        accent: "#b8c7ff",
        chatAccent: "#eaa77a",
      }),
    ).toBeUndefined()
  })

  it("雑談の差し色が欠けた create-character は undefined（両方 required）", () => {
    expect(
      parseClientCommand({
        type: "create-character",
        commandId: "c-1",
        id: "fictional-2",
        name: "",
        portraits: { default: TINY_PNG_DATA_URL },
        accent: "#b8c7ff",
      }),
    ).toBeUndefined()
  })

  it("空の行と、上限を超えた行を持つ forget-remembered-line は undefined", () => {
    expect(
      parseClientCommand({ type: "forget-remembered-line", commandId: "c-6", line: "" }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "forget-remembered-line",
        commandId: "c-6",
        line: "あ".repeat(MAX_REMEMBERED_LINE_LENGTH + 1),
      }),
    ).toBeUndefined()
  })

  it("空の path を持つ open-file は undefined", () => {
    expect(parseClientCommand({ type: "open-file", commandId: "c-7", path: "" })).toBeUndefined()
  })

  it("一覧に無いモデル・許可モード、形の合わない答えは undefined", () => {
    expect(
      parseClientCommand({ type: "set-model", commandId: "c-4", model: "gpt" }),
    ).toBeUndefined()
    expect(
      parseClientCommand({ type: "set-permission-mode", commandId: "c-5", mode: "dontAsk" }),
    ).toBeUndefined()
    expect(
      parseClientCommand({
        type: "answer",
        commandId: "c-3",
        id: "toolu_1",
        answer: { kind: "??" },
      }),
    ).toBeUndefined()
  })
})

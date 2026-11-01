import { expect, test } from "vitest"

import { PLAIN_WORDS } from "../../../../src/server/report/core/plain-word.ts"

test("言い換え先は、元の綴りを含まない（含むと言い換えた本文がまた差し戻される）", () => {
  expect(PLAIN_WORDS.filter((word) => word.replacement.includes(word.spelling))).toEqual([])
})

test("面・葉は複合語の綴りで登録し、単独の綴りは登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("面")
  expect(spellings).not.toContain("葉")
})

test("節は複合語の綴りで登録し、単独の綴りは登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("節")
  expect(spellings).toEqual(
    expect.arrayContaining(["レポートの節", "見出しの無い節", "節の塊", "節が2つ以上"]),
  )
})

test("棚・台本は複合語の綴りで登録し、単独の綴りと別の意味の語（棚卸し・再現の台本）は登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("棚")
  expect(spellings).not.toContain("台本")
  expect(spellings).toEqual(
    expect.arrayContaining(["画像の棚", "棚から", "台本の完了", "台本の中の委譲先"]),
  )
})

test("札は複合語の綴りで登録し、単独の綴りは登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("札")
  expect(spellings).toEqual(
    expect.arrayContaining([
      "プラン使用量の札",
      "使用量の札",
      "答え待ちの札",
      "おすすめの札",
      "お伺いの札",
      "働くあいだの札",
      "メインビューの札",
      "いまの作業の札",
      "コンテキストの札",
      "結果の札",
      "提案の札",
      "始め方の札",
      "数の札",
      "浮かぶ札",
      "吊り札",
      "卒業の札",
      "形の札",
      "変更の札",
      "部屋の名前の札",
      "セッションの札",
      "絞り込みの札",
      "等幅の札",
      "出典の札",
      "列挙型の札",
    ]),
  )
})

test("塊は複合語の綴りで登録し、単独の綴りは登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("塊")
  expect(spellings).toEqual(
    expect.arrayContaining([
      "失敗の塊",
      "振り返りの塊",
      "お願いの塊",
      "逃げ道の塊",
      "検証結果の塊",
      "ファイルの塊",
      "画像の塊",
      "前後の塊",
      "図の塊",
      "何個目の塊",
    ]),
  )
  expect(spellings).not.toContain("塊の種類")
  expect(spellings).not.toContain("塊の欄")
  expect(PLAIN_WORDS.find((word) => word.spelling === "節の塊")?.replacement).toBe(
    "セクションの部品",
  )
  expect(PLAIN_WORDS.find((word) => word.spelling === "失敗の塊")?.replacement).toBe("失敗の表示")
})

test("柱・包みは複合語の綴りで登録し、単独の綴りと別の意味の語は登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("柱")
  expect(spellings).not.toContain("包み")
  expect(spellings).not.toContain("題の包み")
  expect(spellings).not.toContain("柱の口")
  expect(spellings).not.toContain("窓幅の柱")
  expect(spellings).toEqual(
    expect.arrayContaining([
      "余白の柱の包み",
      "傍注の包み",
      "傍注の柱",
      "余白の柱",
      "題つきの包み",
      "並列のフェーズの包み",
      "包み関数",
      "包み hook",
    ]),
  )
  expect(PLAIN_WORDS.find((word) => word.spelling === "余白の柱")?.replacement).toBe("欄外注の列")
  expect(PLAIN_WORDS.find((word) => word.spelling === "包み hook")?.replacement).toBe(
    "ラッパー hook",
  )
})

test("目録は複合語の綴りで登録し、単独の綴りは登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("目録")
  expect(spellings).toEqual(expect.arrayContaining(["目録の1行", "目録の末尾", "目録の頭"]))
  expect(PLAIN_WORDS.find((word) => word.spelling === "目録の1行")?.replacement).toBe(
    "タスク見出し行",
  )
})

test("合図は通知を指す複合語の綴りで登録し、単独の綴りと別の意味の語は登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).not.toContain("合図")
  expect(spellings).toEqual(
    expect.arrayContaining(["合図が届", "合図の届", "合図を受け", "合図を送"]),
  )
  for (const kept of ["合図の行", "合図にする", "合図を鍵に", "合図した", "合図する"]) {
    expect(spellings.filter((spelling) => kept.includes(spelling))).toEqual([])
  }
  expect(PLAIN_WORDS.find((word) => word.spelling === "合図が届")?.replacement).toBe("通知が届")
})

test("口は複合語の綴りで登録し、単独の綴りと別の意味の語は登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).toEqual(
    expect.arrayContaining([
      "押す口",
      "押せる口",
      "開く口",
      "選び口",
      "読み書き口",
      "書き込み口",
      "受け取り口",
      "知らせ口",
      "起こす口",
      "手続きが使う口",
    ]),
  )
  for (const spelling of [
    "口",
    "の口",
    "入口",
    "出口",
    "窓口",
    "口調",
    "閉じた口",
    "開いた口",
    "読む口",
    "使う口",
    "書き口",
    "読み口",
    "受け口",
    "差し込み口",
    "柱の口",
  ]) {
    expect(spellings).not.toContain(spelling)
  }
  expect(PLAIN_WORDS.find((word) => word.spelling === "押す口")?.replacement).toBe("ボタン")
})

test("脇の話は複合語の綴りで登録し、単独の綴りと据え置いた語は登録しない", () => {
  const spellings = PLAIN_WORDS.map((word) => word.spelling)
  expect(spellings).toEqual(
    expect.arrayContaining([
      "脇の話のターン",
      "脇の話の欄",
      "脇の話の包み",
      "脇の話の答え",
      "脇の話のあいだ",
    ]),
  )
  expect(spellings).not.toContain("脇の話")
  expect(PLAIN_WORDS.find((word) => word.spelling === "脇の話の欄")?.replacement).toBe(
    "補足メッセージの欄",
  )
})

test("長い綴りが、それを含む短い綴りより先に並んでいる", () => {
  expect(
    PLAIN_WORDS.filter((word, index) =>
      PLAIN_WORDS.slice(0, index).some((earlier) => word.spelling.includes(earlier.spelling)),
    ),
  ).toEqual([])
})

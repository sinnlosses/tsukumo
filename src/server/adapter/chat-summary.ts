// 雑談の要約の写し（`docs/design.md` 7章「雑談の記憶の要約はどこに置くか」）。ファイルに触るのは
// ここだけ（原則3。1ファイル = 1つの境界）。置き場は `~/.tsukumo/chat-summary/<パック名>.md`、
// パックごとに1ファイルで `cwd` には依存させない。
//
// **何を載せるかの判断はここが決めない。** 判断は `src/server/core/chat-summary-prompt.ts` が
// 持ち、ここが持つのは「どこに・どう書き、どう渡すか」——写しと印の読み書きだけ
// （`docs/coding-standards.md`「会話内容の扱い」とぶつからないための切り分け。
// `src/server/adapter/persona-memory.ts` と同じ形）。
//
// **中身は1行目が印、2行目から要約の本文。** 印は「次に起こすセッションへ渡す必要があるか」の
// 1ビットで、`DELIVERED_MARK` の1行だけを「渡し済み」と読み、それ以外（別の文字列・無い・
// 読めない）はすべて「未渡し」として扱う——倒れる方向を「同じ要約が2度載る」側にする
// （`docs/requirements.md` 4.9）。
//
// 書けなくても例外を投げない（常駐プロセスは1回の失敗で落ちない。
// `docs/coding-standards.md`「エラーハンドリング」）。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { isCharacterPackName } from "../../shared/character.ts"
import { type ChatSummary, type ChatSummaryRecord } from "../core/session-driver.ts"
import { tsukumoHomeDir } from "./tsukumo-home.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/chat-summary/`）。 */
const CHAT_SUMMARY_DIR_NAME = "chat-summary"

/** ファイルの1行目に書く印の文字列。この1行だけが「渡し済み」で、それ以外は「未渡し」。 */
const DELIVERED_MARK = "delivered"
const UNDELIVERED_MARK = "undelivered"

/**
 * 1ファイルの上限（`docs/design.md` 7章の表）。**印の行を含めて** 8 KiB——写しと印は同じ
 * 書き込みで揃う1つのファイルなので、上限も分けずに数える。
 */
export const CHAT_SUMMARY_LIMIT_BYTES = 8 * 1024

const textEncoder = new TextEncoder()

/**
 * 画面から作ったキャラクターパックと同じ親（`~/.tsukumo/chat-summary`）。書き込んでよいのは
 * この下だけ。
 */
export function chatSummaryDir(): string {
  return join(tsukumoHomeDir(), CHAT_SUMMARY_DIR_NAME)
}

/**
 * パック1つぶんの写しの読み書き口を作る（**雑談モードのときだけ**呼ばれる。
 * `src/session-start.ts`）。`packName` は {@link isCharacterPackName} を通ったものだけ受け付け、
 * 通らない名前はパスを組み立てず、読み書きとも何もしない口を返す（`..` や区切り文字が名前として
 * 通らない。`docs/design.md` 7.1 と同じ規則）。
 *
 * `root` は書き込み先の親（既定は {@link chatSummaryDir}）。差し替えられるのはテストがホームを
 * 汚さないためにある（`createPersonaMemory` の `root` と同じ手）。
 */
export function createChatSummary(packName: string, root: string = chatSummaryDir()): ChatSummary {
  if (!isCharacterPackName(packName)) {
    return {
      read: () => undefined,
      write: () => {},
      markUndelivered: () => {},
      markDelivered: () => {},
    }
  }

  const path = join(root, `${packName}.md`)
  return {
    read: () => readRecord(path),
    write: (summary) => writeRecord(path, { summary: truncatedSummary(summary), delivered: true }),
    markUndelivered: () => rewriteMark(path, false),
    markDelivered: () => rewriteMark(path, true),
  }
}

/** 印だけを書き換える。**本文は既にある写しをそのまま保つ**（無ければ空のまま）。 */
function rewriteMark(path: string, delivered: boolean): void {
  const current = readRecord(path)
  writeRecord(path, { summary: current?.summary ?? "", delivered })
}

/** 写しと印を読む。ファイルが無い・読めないときは undefined。 */
function readRecord(path: string): ChatSummaryRecord | undefined {
  const content = readOptionalFile(path)
  if (content === undefined) {
    return undefined
  }

  const newline = content.indexOf("\n")
  const mark = newline === -1 ? content : content.slice(0, newline)
  const summary = newline === -1 ? "" : content.slice(newline + 1)
  return { summary, delivered: mark === DELIVERED_MARK }
}

/** 写しと印を1回の書き込みで揃える（上書き）。失敗しても例外を投げない。 */
function writeRecord(path: string, record: ChatSummaryRecord): void {
  try {
    mkdirSync(dirname(path), { recursive: true })
    const mark = record.delivered ? DELIVERED_MARK : UNDELIVERED_MARK
    writeFileSync(path, `${mark}\n${record.summary}`)
  } catch {
    // 書けなかった回は諦めて次へ進む。
  }
}

/**
 * 8 KiB（印の行を含む）に収まるよう、要約の本文を行単位で切り詰める。**古いほうの行から
 * 落とし、行の途中では切らない。**
 *
 * 本文の行は「新しい→古い」の順に積み、収まらなくなったところで古い行を落とす（要約の文面が
 * 「前の要約 + 新しい会話」を毎回まとめ直したものなので、末尾に近いほうが新しい話題という前提。
 * `docs/requirements.md` 4.9）。
 *
 * **1行だけで印を除いた残りの上限を超えるとき（改行が無い）は、その1行をそのまま残す。**
 * 空にする（＝要約ごと消える）よりも、上限を少し超えるほうを選ぶ——「行の途中では切らない」を
 * 「8 KiB を必ず守る」より優先する。
 */
function truncatedSummary(summary: string): string {
  // 印の行の分（マークの長さ + 改行1つ）を引いた残りが本文の予算。渡し済み・未渡しのどちらで
  // 書かれるかは呼び出し側が決めるが、印の2つの文字列の長さの差は数バイトなので、長いほう
  // （`UNDELIVERED_MARK`）で見積もっておけば、あとで印だけ書き換えても超えない。
  const markBudget = byteLength(UNDELIVERED_MARK) + 1
  const budget = CHAT_SUMMARY_LIMIT_BYTES - markBudget
  if (budget <= 0) {
    return ""
  }

  const kept: string[] = []
  let usedBytes = 0
  for (const line of [...summary.split("\n")].reverse()) {
    const separatorBytes = kept.length > 0 ? 1 : 0
    const lineBytes = byteLength(line) + separatorBytes
    if (kept.length > 0 && usedBytes + lineBytes > budget) {
      break
    }
    kept.unshift(line)
    usedBytes += lineBytes
  }

  return kept.join("\n")
}

function byteLength(text: string): number {
  return textEncoder.encode(text).length
}

function readOptionalFile(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8")
  } catch {
    return undefined
  }
}

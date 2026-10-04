// あらすじ（雑談と仕事で1つ）の写し。ファイルに触るのはここだけ。
// 置き場は `~/.tsukumo/chat-summary/<パック名>.md` で、パックごとに1ファイル、`cwd` には依存させない。
// 書き出してよい範囲は `docs/coding-standards.md`「会話内容の扱い」の例外の表が決めている。
//
// 何を載せるかの判断はここが決めない。ここが持つのは写しと印の読み書きだけ。
//
// 中身は1行目が印、2行目から要約の本文。
// 印は「次に起こすセッションへ渡す必要があるか」の1ビットで、`DELIVERED_MARK` の1行だけを「渡し済み」と読む。
// それ以外（別の文字列・無い・読めない）はすべて「未渡し」として扱い、倒れる方向を「同じ要約が2度載る」側にする。
//
// 書けなくても例外を投げない。

import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

import { isCharacterPackName } from "../../../shared/character-pack/character.ts"
import { CHAT_MEMORY_BUDGET } from "../../../shared/chat/chat-memory-budget.ts"
import { byteLength } from "../../../shared/utils/byte-length.ts"
import { readOptionalFile } from "../../adapter/lib/optional-file.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { ChatSummary, ChatSummaryRecord } from "../../session-driver/core/session-driver.ts"

/** 置き場のディレクトリ名（`~/.tsukumo/chat-summary/`）。 */
const CHAT_SUMMARY_DIR_NAME = "chat-summary"

/** ファイルの1行目に書く印の文字列。この1行だけが「渡し済み」で、それ以外は「未渡し」。 */
const DELIVERED_MARK = "delivered"
const UNDELIVERED_MARK = "undelivered"

/**
 * 1ファイルの上限。印の行を含めて数える。
 * 写しと印は同じ書き込みで揃う1つのファイルなので、上限も分けない。
 */
export const CHAT_SUMMARY_LIMIT_BYTES = CHAT_MEMORY_BUDGET.synopsisBytes

/** 置き場の親（`~/.tsukumo/chat-summary`）。書き込んでよいのはこの下だけ。 */
export function chatSummaryDir(): string {
  return join(tsukumoHomeDir(), CHAT_SUMMARY_DIR_NAME)
}

/**
 * パック1つぶんの写しの読み書き口を作る。
 * `packName` は {@link isCharacterPackName} を通ったものだけ受け付け、通らない名前はパスを組み立てず、読み書きとも何もしない口を返す。
 *
 * `root` は書き込み先の親（既定は {@link chatSummaryDir}）。
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
    write: (summary) =>
      writeRecord(path, {
        summary: truncatedSummary(summary),
        delivered: readRecord(path)?.delivered ?? false,
      }),
    markUndelivered: () => rewriteMark(path, false),
    markDelivered: () => rewriteMark(path, true),
  }
}

/**
 * パック1つぶんの写しを消す。同じ名前で作り直したパックが、消したパックの要約を黙って拾わないため。
 * 無い・消せないときも何もせず続ける。名前が {@link isCharacterPackName} を通らなければパスを組み立てない。
 */
export function discardChatSummary(packName: string, root: string = chatSummaryDir()): void {
  if (!isCharacterPackName(packName)) {
    return
  }

  try {
    rmSync(join(root, `${packName}.md`), { force: true })
  } catch {
    // 消せないだけ。パックはもう一覧に無いので、写しは次に同じ名前で作るまで読まれない。
  }
}

/** 印だけを書き換える。本文は既にある写しをそのまま保つ（無ければ空のまま）。 */
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
 * {@link CHAT_SUMMARY_LIMIT_BYTES}（印の行を含む）に収まるよう、要約の本文を行単位で切り詰める。
 * 古いほうの行から落とし、行の途中では切らない。
 *
 * 本文の行は「新しい→古い」の順に積み、収まらなくなったところで古い行を落とす。
 * 要約の文面は「前の要約 + 新しい会話」を毎回まとめ直したものなので、末尾に近いほうが新しい話題という前提。
 *
 * 1行だけで印を除いた残りの上限を超えるとき（改行が無い）は、その1行をそのまま残す。
 * 空にする（＝要約ごと消える）よりも、上限を少し超えるほうを選ぶ。
 */
function truncatedSummary(summary: string): string {
  // 印の行の分（マークの長さ + 改行1つ）を引いた残りが本文の予算。
  // 渡し済み・未渡しのどちらで書かれるかは呼び出し側が決めるので、長いほう（`UNDELIVERED_MARK`）で見積もっておけば、あとで印だけ書き換えても超えない。
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

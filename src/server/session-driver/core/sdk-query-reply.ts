// SDK への問い合わせ（`supportedCommands()`・`accountInfo()`・`supportedModels()`）の戻り値を、
// 検証して tsukumo 内部の型に変える。戻り値は外部由来の値なので、構造を信用せず unknown で受ける。

import { isPlainObject } from "remeda"

import { type EffortLevel, isEffortLevel } from "../../../shared/command.ts"
import type {
  CommandDescription,
  ModelEffortSupport,
} from "../../../shared/session/session-event.ts"
import { optionalString } from "../../../shared/utils/optional-string.ts"

/**
 * SDK が返すコマンド一覧（`supportedCommands()` の戻り値と `commands_changed` の `commands`）を検証して内部の型に変える。
 * 名前が文字列でない要素は捨て、説明が空文字のものは `undefined` にする。
 */
export function toCommandDescriptions(value: unknown): readonly CommandDescription[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!isPlainObject(item) || typeof item.name !== "string" || item.name === "") {
      return []
    }
    const description = optionalString(item.description)
    return [{ name: item.name, description: description === "" ? undefined : description }]
  })
}

/**
 * `accountInfo()` の戻り値からプランを取り出す。
 * `email` / `organization` はここで捨て、駆動の外へ出さない（戻り値に載せないので、他のフィールドに触れる経路が無い）。
 * 空文字は「無い」に畳む。
 */
export function toPlan(value: unknown): string | undefined {
  if (!isPlainObject(value)) {
    return undefined
  }
  const plan = optionalString(value.subscriptionType)
  return plan === "" ? undefined : plan
}

/**
 * `supportedModels()` の戻り値から、effort に関わる部分だけを取り出す（`ModelEffortSupport`）。
 * 運ぶのは「いま効いている値」ではなく「対応の有無・選べる段」だけ（実測は `docs/history/decision.md`「effort の途中変更と読み取りが成り立った実測」）。
 *
 * `value` が文字列でない要素は捨てる。`supportsEffort` は真偽値でなければ `false` に倒す。
 * `supportedEffortLevels` は配列でない・{@link isEffortLevel} を通らない要素を捨て、最終的に空になれば `[]` に畳む。
 * 未知の段が増えても、知っている段だけを選べる一覧として出すため。
 */
export function toModelEffortSupport(value: unknown): readonly ModelEffortSupport[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!isPlainObject(item) || typeof item.value !== "string") {
      return []
    }
    const levels = Array.isArray(item.supportedEffortLevels) ? item.supportedEffortLevels : []
    return [
      {
        model: item.value,
        supportsEffort: item.supportsEffort === true,
        effortLevels: levels.filter(
          (level): level is EffortLevel => typeof level === "string" && isEffortLevel(level),
        ),
      },
    ]
  })
}

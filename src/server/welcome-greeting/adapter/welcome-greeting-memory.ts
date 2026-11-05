// 直近の迎えの挨拶。ファイルに触るのはここだけで、置き場はキャラごとの `~/.tsukumo/welcome-greeting/<キャラ名>.json`。
// 入るのは挨拶の2つの文だけで、会話は入らない。

import { basename, join } from "node:path"

import { z } from "zod"

import { versionedJsonFile } from "../../adapter/lib/json-file.ts"
import { tsukumoHomePath } from "../../adapter/tsukumo-home.ts"
import type { WelcomeGreetingText } from "../core/welcome-greeting.ts"

/** ファイルの形の版。形を変えたら上げ、古いファイルと見分ける。 */
const WELCOME_GREETING_FORMAT_VERSION = 1 satisfies number

const welcomeGreetingSchema = z.object({
  recent: z.array(z.object({ withCard: z.string(), withoutCard: z.string() })),
})

/** 直近の挨拶を新しい順に読む。ファイルが無い・壊れている・版や形が違う・名前が不正なときは空。 */
export function readRecentWelcomeGreetings(
  characterName: string,
  path: string = welcomeGreetingMemoryPath(characterName),
): readonly WelcomeGreetingText[] {
  if (!isPlainFileName(characterName)) {
    return []
  }
  return welcomeGreetingFile(path).read()?.recent ?? []
}

/** 直近の挨拶を丸ごと書く。失敗しても例外を投げない。名前が不正なときは何もしない。 */
export function writeRecentWelcomeGreetings(
  characterName: string,
  recent: readonly WelcomeGreetingText[],
  path: string = welcomeGreetingMemoryPath(characterName),
): void {
  if (!isPlainFileName(characterName)) {
    return
  }
  welcomeGreetingFile(path).write({ recent })
}

function welcomeGreetingFile(path: string) {
  return versionedJsonFile({
    version: WELCOME_GREETING_FORMAT_VERSION,
    schema: welcomeGreetingSchema,
    path,
  })
}

function welcomeGreetingMemoryPath(characterName: string): string {
  return join(tsukumoHomePath("welcomeGreeting"), `${characterName}.json`)
}

/** ディレクトリの区切り・`.`・`..`・空を含まず、ファイル名の1要素として使える名前。 */
function isPlainFileName(name: string): boolean {
  return (
    name !== "" &&
    name !== "." &&
    name !== ".." &&
    basename(name) === name &&
    !name.includes("\\") &&
    !name.includes("\0")
  )
}

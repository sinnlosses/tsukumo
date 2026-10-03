// 直近の迎えの挨拶。ファイルに触るのはここだけで、置き場は `~/.tsukumo/welcome-greeting.json`。
// 入るのは挨拶の2つの文だけで、会話は入らない。

import { join } from "node:path"

import { z } from "zod"

import { readJsonFile, writeJsonFile } from "../../adapter/lib/json-file.ts"
import { tsukumoHomeDir } from "../../adapter/tsukumo-home.ts"
import type { WelcomeGreetingText } from "../core/welcome-greeting.ts"

const WELCOME_GREETING_FILE_NAME = "welcome-greeting.json"

/** ファイルの形の版。形を変えたら上げ、古いファイルと見分ける。 */
const WELCOME_GREETING_FORMAT_VERSION = 1 satisfies number

const welcomeGreetingFileSchema = z.object({
  v: z.literal(WELCOME_GREETING_FORMAT_VERSION),
  recent: z.array(z.object({ withCard: z.string(), withoutCard: z.string() })),
})

export function welcomeGreetingMemoryPath(): string {
  return join(tsukumoHomeDir(), WELCOME_GREETING_FILE_NAME)
}

/** 直近の挨拶を新しい順に読む。ファイルが無い・壊れている・版や形が違うときは空。 */
export function readRecentWelcomeGreetings(
  path: string = welcomeGreetingMemoryPath(),
): readonly WelcomeGreetingText[] {
  const parsed = welcomeGreetingFileSchema.safeParse(readJsonFile(path))
  return parsed.success ? parsed.data.recent : []
}

/** 直近の挨拶を丸ごと書く。失敗しても例外を投げない。 */
export function writeRecentWelcomeGreetings(
  recent: readonly WelcomeGreetingText[],
  path: string = welcomeGreetingMemoryPath(),
): void {
  writeJsonFile(path, { v: WELCOME_GREETING_FORMAT_VERSION, recent })
}

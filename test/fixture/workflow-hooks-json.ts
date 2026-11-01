import { readFileSync } from "node:fs"

import type { HookCallbackMatcher, HookEvent } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

const hooksJsonSchema = z.object({
  hooks: z.record(
    z.string(),
    z.array(
      z.object({
        matcher: z.string().optional(),
        hooks: z.array(z.object({ command: z.string(), args: z.array(z.string()).optional() })),
      }),
    ),
  ),
})

const HOOKS_JSON_URL = new URL("../../vendor/tsukumo-plugins/hooks/hooks.json", import.meta.url)

/**
 * plugin の `hooks.json` から、`bin/tw-hook` を `args` にサブコマンドを含めて呼ぶ登録の「イベント:matcher」を並べて返す。
 * matcher が無い登録は `イベント:` になる。
 */
export function workflowHookPairs(subcommand: string): string[] {
  const parsed = hooksJsonSchema.parse(JSON.parse(readFileSync(HOOKS_JSON_URL, "utf8")))
  const pairs: string[] = []
  for (const [event, entries] of Object.entries(parsed.hooks)) {
    for (const entry of entries) {
      const calls = entry.hooks.some(
        (hook) => hook.command.endsWith("/bin/tw-hook") && hook.args?.includes(subcommand),
      )
      if (calls) {
        pairs.push(`${event}:${entry.matcher ?? ""}`)
      }
    }
  }
  return pairs.toSorted()
}

/** `withXxx({}, false, …)` が返した表から、同じ形の「イベント:matcher」を並べて返す。 */
export function registeredHookPairs(
  table: Partial<Record<HookEvent, HookCallbackMatcher[]>>,
): string[] {
  return Object.entries(table)
    .flatMap(([event, entries]) =>
      (entries ?? []).map((entry) => `${event}:${entry.matcher ?? ""}`),
    )
    .toSorted()
}

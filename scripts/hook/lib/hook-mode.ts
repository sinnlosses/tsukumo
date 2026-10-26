// hook の mode（log-only / block）を読む口。log-only の hook は拒む形を記録するだけで、Bash を止めない。

type HookMode = "log-only" | "block"

const LOG_ONLY_HOOKS: readonly string[] = []

/** `TSUKUMO_HOOK_LOG_ONLY` にカンマ区切りで hook の名前を渡すと、その hook も log-only になる。 */
export function readHookMode(hook: string, env: NodeJS.ProcessEnv = process.env): HookMode {
  const fromEnv = (env["TSUKUMO_HOOK_LOG_ONLY"] ?? "").split(",").map((name) => name.trim())
  return LOG_ONLY_HOOKS.includes(hook) || fromEnv.includes(hook) ? "log-only" : "block"
}

// 取り込んだ tsukumo-plugins（git submodule）の置き場と、プラグインとして読める状態かの検査。

import { access } from "node:fs/promises"
import { join } from "node:path"

import { bundledFilePath } from "../../adapter/bundled-path.ts"

export type WorkflowPluginReading =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

export function workflowPluginDir(): string {
  return bundledFilePath("vendor", "tsukumo-plugins")
}

export async function readWorkflowPlugin(pluginDir: string): Promise<WorkflowPluginReading> {
  const manifest = join(pluginDir, ".claude-plugin", "plugin.json")
  try {
    await access(manifest)
    return { ok: true }
  } catch {
    return { ok: false, reason: `${manifest} が無い（git submodule update --init で取り込む）` }
  }
}

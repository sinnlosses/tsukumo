// 取り込んだ tsukumo-plugins（git submodule）の置き場と、プラグインとして読める状態かの検査、
// 利用者が同じスキルとエージェントをリンクで入れているかの判定。

import type { Dirent } from "node:fs"
import { access, readdir } from "node:fs/promises"
import { join } from "node:path"

import { bundledFilePath } from "../../adapter/bundled-path.ts"
import { defaultClaudeConfigDir } from "../../adapter/tsukumo-home.ts"

export type WorkflowPluginReading =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string }

export function workflowPluginDir(): string {
  return bundledFilePath("vendor", "tsukumo-plugins")
}

/**
 * 取り込んだプラグインを載せるかの判定。
 * 利用者の置き場に全部あれば載せず（`user-installed`）、一部だけなら欠けを作らないよう載せる（`partial`）。
 */
export type WorkflowPluginMount =
  | { readonly kind: "mount" }
  | { readonly kind: "user-installed" }
  | { readonly kind: "partial"; readonly missing: readonly string[] }

export async function readWorkflowPluginMount(
  pluginDir: string,
  claudeConfigDir: string | undefined,
): Promise<WorkflowPluginMount> {
  const configDir = claudeConfigDir ?? defaultClaudeConfigDir()
  return classifyWorkflowPluginMount(await readNames(pluginDir), await readNames(configDir))
}

export function figurePluginDir(): string {
  return join(workflowPluginDir(), "plugins", "tsukumo-figure")
}

/** 任意の図のプラグインを載せるかの判定。`absent` は取り込みに plugin.json が無いこと。 */
export type FigurePluginMount =
  | { readonly kind: "mount" }
  | { readonly kind: "absent" }
  | { readonly kind: "user-installed" }

export async function readFigurePluginMount(
  pluginDir: string,
  claudeConfigDir: string | undefined,
): Promise<FigurePluginMount> {
  if (!(await readWorkflowPlugin(pluginDir)).ok) {
    return { kind: "absent" }
  }
  const configDir = claudeConfigDir ?? defaultClaudeConfigDir()
  const installed = await readNames(configDir)
  return installed.includes(`skills/${FIGURE_SKILL}`)
    ? { kind: "user-installed" }
    : { kind: "mount" }
}

const FIGURE_SKILL = "figure-capture"

export async function readWorkflowPlugin(pluginDir: string): Promise<WorkflowPluginReading> {
  const manifest = join(pluginDir, ".claude-plugin", "plugin.json")
  try {
    await access(manifest)
    return { ok: true }
  } catch {
    return { ok: false, reason: `${manifest} が無い（git submodule update --init で取り込む）` }
  }
}

function classifyWorkflowPluginMount(
  wanted: readonly string[],
  present: readonly string[],
): WorkflowPluginMount {
  const missing = wanted.filter((name) => !present.includes(name))
  if (wanted.length === 0 || missing.length === wanted.length) {
    return { kind: "mount" }
  }
  return missing.length === 0 ? { kind: "user-installed" } : { kind: "partial", missing }
}

/** 置き場にあるスキルとエージェント定義の名前を、`skills/<名前>`・`agents/<名前>`（拡張子なし）の形で並べる。 */
async function readNames(baseDir: string): Promise<string[]> {
  const skills = await readEntries(baseDir, "skills")
  const agents = await readEntries(baseDir, "agents")
  return [
    ...skills
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => `skills/${entry.name}`),
    ...agents
      .filter((entry) => entry.name.endsWith(".md"))
      .map((entry) => `agents/${entry.name.slice(0, -".md".length)}`),
  ]
}

function readEntries(baseDir: string, kind: "skills" | "agents"): Promise<Dirent[]> {
  return readdir(join(baseDir, kind), { withFileTypes: true }).catch(() => [])
}

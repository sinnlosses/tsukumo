// サブエージェントの WebFetch が、許可リストの外のホストを読む形を見つける。
// 記録に URL・ホスト名を入れないため、拒否の文にも入れない。

import type { BashDenial } from "./bash-denial.ts"
import type { WebFetchHookCall } from "./web-fetch-hook-call.ts"

const REFUSAL = `許可リストの外のホストは、委譲先の WebFetch で読まない。
読みたい URL を報告に書いてメインに預けること（許可リストの置き場は docs/coding-standards/external-send.md「調べものの委譲先」）。`

// docs/ で引用が 5 回以上あるホスト。ほかの項目のサブドメインになるものは親の項目が覆う。
const ALLOWED_FETCH_HOSTS = [
  "a2ui.org",
  "arxiv.org",
  "blog.google",
  "buildkite.com",
  "c4model.com",
  "carbondesignsystem.com",
  "cdn.jsdelivr.net",
  "claude.com",
  "cursor.com",
  "d2lang.com",
  "design-system.service.gov.uk",
  "developer.apple.com",
  "developer.mozilla.org",
  "developers.google.com",
  "distill.pub",
  "docs.slack.dev",
  "docs.stripe.com",
  "doi.org",
  "europepmc.org",
  "expressive-code.com",
  "fonts.googleapis.com",
  "framework.blackboard.sh",
  "github.blog",
  "github.com",
  "grafana.com",
  "guidance.publishing.service.gov.uk",
  "homes.cs.washington.edu",
  "idl.cs.washington.edu",
  "idl.uw.edu",
  "learn.microsoft.com",
  "linear.app",
  "martinfowler.com",
  "mechanism.ucsd.edu",
  "mermaid.js.org",
  "observablehq.com",
  "openai.com",
  "people.ischool.berkeley.edu",
  "playwright.dev",
  "practicaltypography.com",
  "primer.style",
  "quarto.org",
  "raw.githubusercontent.com",
  "reactjs.org",
  "sre.google",
  "support.apple.com",
  "v2.tauri.app",
  "vega.github.io",
  "vercel.com",
  "www.anthropic.com",
  "www.datawrapper.de",
  "www.edwardtufte.com",
  "www.electronjs.org",
  "www.nngroup.com",
  "www.notion.com",
  "www.perceptualedge.com",
  "www.perplexity.ai",
  "www.w3.org",
] as const satisfies readonly string[]

const FETCHED_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"])

export function findWebFetchHostDenial(call: WebFetchHookCall): BashDenial | undefined {
  if (!call.fromSubagent) {
    return undefined
  }
  const host = readHost(call.url)
  if (host === undefined || isAllowed(host)) {
    return undefined
  }
  return { hook: "deny-web-fetch-host", rule: "host-outside-allowlist", refusal: REFUSAL }
}

/** http(s) の URL のホスト（小文字・末尾の `.` を落とす）。読めない URL と http(s) 以外は `undefined`。 */
function readHost(url: string): string | undefined {
  try {
    const parsed = new URL(url)
    return FETCHED_PROTOCOLS.has(parsed.protocol)
      ? parsed.hostname.toLowerCase().replace(/\.+$/, "")
      : undefined
  } catch {
    return undefined
  }
}

function isAllowed(host: string): boolean {
  return ALLOWED_FETCH_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

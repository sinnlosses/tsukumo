import type {
  EffortLevel as SdkEffortLevel,
  PermissionMode as SdkPermissionMode,
  SDKAssistantMessageError,
} from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"

import { EFFORT_LEVELS, PERMISSION_MODES } from "../../../../src/shared/command.ts"
import { API_ERROR_KINDS } from "../../../../src/shared/session-driver/api-trouble.ts"

describe("shared の値の一覧と SDK の型", () => {
  it("PERMISSION_MODES はすべて SDK の PermissionMode として渡せる値", () => {
    // 代入できること自体が型の検査。SDK 側にはこれ以外の値もある（`dontAsk`。画面には
    // 出さないので shared の一覧には入れていない）ので、確かめるのはこの向きだけ。
    const asSdk: readonly SdkPermissionMode[] = PERMISSION_MODES

    expect([...asSdk].sort()).toEqual([
      "acceptEdits",
      "auto",
      "bypassPermissions",
      "default",
      "plan",
    ])
  })

  it("API_ERROR_KINDS は SDK の SDKAssistantMessageError と同じ綴りの集まり", () => {
    // 片方の向きは代入で、もう片方の向きは全域の表（`satisfies Record<...>`）で確かめる。
    // SDK に綴りが増えたら表の `satisfies` が型で落ち、shared に足し忘れたと分かる。
    const asSdk: readonly SDKAssistantMessageError[] = API_ERROR_KINDS
    const everySdkError = {
      authentication_failed: true,
      oauth_org_not_allowed: true,
      account_on_hold: true,
      verification_required: true,
      billing_error: true,
      rate_limit: true,
      overloaded: true,
      invalid_request: true,
      model_not_found: true,
      server_error: true,
      unknown: true,
      max_output_tokens: true,
      cloud_credential_error: true,
    } satisfies Record<SDKAssistantMessageError, true>

    expect(Object.keys(everySdkError).toSorted()).toEqual(asSdk.toSorted())
  })

  it("EFFORT_LEVELS はすべて SDK の EffortLevel として渡せる値", () => {
    // 代入できること自体が型の検査（PERMISSION_MODES と同じやり方）。
    const asSdk: readonly SdkEffortLevel[] = EFFORT_LEVELS

    expect([...asSdk].sort()).toEqual(["high", "low", "max", "medium", "xhigh"])
  })
})

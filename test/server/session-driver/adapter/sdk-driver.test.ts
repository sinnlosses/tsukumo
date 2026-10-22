import type { SDKAssistantMessageError } from "@anthropic-ai/claude-agent-sdk"
import { describe, expect, it } from "vitest"

import { API_ERROR_KINDS } from "../../../../src/shared/session-driver/api-trouble.ts"

describe("shared の値の一覧と SDK の型", () => {
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
})

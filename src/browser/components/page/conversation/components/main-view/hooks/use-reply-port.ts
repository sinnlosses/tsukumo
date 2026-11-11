// レポートへ渡す口 `ReplyPort` を、入力欄の下書きの store と送り口から組む。

import type { ReplyPort } from "../../../../../../features/report/reply-port.ts"
import { useComposerFocus } from "../../../../../../stores/composer-focus.ts"
import { useComposerDraft } from "../../../stores/composer-draft.ts"
import { useAskSend } from "../../hooks/use-ask-send.ts"

export function useReplyPort(): ReplyPort {
  const appendParagraphToDraft = useComposerDraft((state) => state.appendParagraphToDraft)
  const prependToDraft = useComposerDraft((state) => state.prependToDraft)
  const requestFocus = useComposerFocus((state) => state.requestFocus)
  const ask = useAskSend()
  return {
    ask,
    appendDraft: appendParagraphToDraft,
    prependDraft: (text) => {
      prependToDraft(text)
      requestFocus()
    },
  }
}

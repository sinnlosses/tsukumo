// つくもの日記帳の見開き。
// `<Dialog>` は開閉に関わらず常に描画し、中身だけ `open` で出し分ける。

import type { ReactElement } from "react"

import { Dialog } from "../../../../ui/dialog/dialog.tsx"
import { VStack } from "../../../../ui/v-stack/v-stack.tsx"
import type { DiaryBookModel } from "../../hooks/use-diary-book.ts"
import styles from "./diary-book.module.css"
import { Spread } from "./spread.tsx"
import { Toc } from "./toc.tsx"
import { Topbar } from "./topbar.tsx"

export function DiaryBook({
  open,
  openNote,
  dialogLabel,
  page,
  previous,
  next,
  toc,
  onPrevious,
  onNext,
  onToggleToc,
  onSelectTocDate,
  onClose,
}: DiaryBookModel): ReactElement {
  return (
    <Dialog
      open={open}
      ariaLabel={dialogLabel}
      backdrop="deep"
      placement={{ kind: "auto" }}
      onClose={onClose}
      className={styles["diary-book"]}
    >
      {open && (
        <VStack
          element="div"
          name={{ kind: "none" }}
          gap="lg"
          align="stretch"
          justify="start"
          wrap="nowrap"
          className={styles["diary-book-stage"]}
        >
          <Topbar
            openNote={openNote}
            previous={previous}
            next={next}
            onPrevious={onPrevious}
            onNext={onNext}
            onToggleToc={onToggleToc}
            onClose={onClose}
          />
          <div className={styles["diary-book-spread"]}>
            <Spread page={page} />
          </div>
          {toc.open && <Toc months={toc.months} onSelect={onSelectTocDate} />}
        </VStack>
      )}
    </Dialog>
  )
}

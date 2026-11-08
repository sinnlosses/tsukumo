// 「頼む」の付箋の中身の定型。

export function optionNoteBody(): string {
  return "この案で進めて。"
}

export function claimNoteBody(howToVerify: string): string {
  const method = howToVerify.trim()
  return method === "" ? "確かめて。" : `確かめて。確かめ方: ${method}`
}

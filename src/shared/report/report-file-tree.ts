// `files` の塊のパスの並びを、フォルダを畳んだ樹形図の行へ組む。

/** 樹形図の1行。`guide` は行頭の罫（`├── ` や `│   └── `）で、先頭の共通の親の行だけ空。 */
export type FileTreeRow<Item> =
  | { readonly kind: "folder"; readonly guide: string; readonly name: string }
  | { readonly kind: "file"; readonly guide: string; readonly name: string; readonly item: Item }

type TreeNode<Item> = FolderNode<Item> | FileNode<Item>

type FolderNode<Item> = {
  readonly kind: "folder"
  readonly name: string
  readonly children: TreeNode<Item>[]
}

type FileNode<Item> = {
  readonly kind: "file"
  readonly name: string
  readonly item: Item
}

const BRANCH_MIDDLE = "├── "
const BRANCH_LAST = "└── "
const GUIDE_CONTINUE = "│   "
const GUIDE_BLANK = "    "

export function fileTreeRows<Item>(
  items: readonly Item[],
  pathOf: (item: Item) => string,
): readonly FileTreeRow<Item>[] {
  if (items.every((item) => !pathOf(item).includes("/"))) {
    return items.map((item) => ({ kind: "file", guide: "", name: pathOf(item), item }))
  }

  const root: FolderNode<Item> = { kind: "folder", name: "", children: [] }
  for (const item of items) {
    const segments = pathOf(item).split("/")
    const fileName = segments.pop() ?? ""
    const folder = segments.reduce<FolderNode<Item>>((parent, segment) => {
      const found = parent.children.find(
        (child): child is FolderNode<Item> => child.kind === "folder" && child.name === segment,
      )
      if (found !== undefined) {
        return found
      }
      const created: FolderNode<Item> = { kind: "folder", name: segment, children: [] }
      parent.children.push(created)
      return created
    }, root)
    folder.children.push({ kind: "file", name: fileName, item })
  }

  const [only, ...rest] = root.children
  if (only?.kind !== "folder" || rest.length > 0) {
    return childRows(root.children, "")
  }
  const top = joinSingleChain(only)
  return [{ kind: "folder", guide: "", name: `${top.name}/` }, ...childRows(top.children, "")]
}

/** 子がフォルダ1つだけのフォルダを、その子と連ねる（子のフォルダも同じく畳む）。 */
function joinSingleChain<Item>(folder: FolderNode<Item>): FolderNode<Item> {
  const [only, ...rest] = folder.children
  if (only?.kind === "folder" && rest.length === 0) {
    const joined = joinSingleChain(only)
    return { kind: "folder", name: `${folder.name}/${joined.name}`, children: joined.children }
  }
  return folder
}

function childRows<Item>(
  children: readonly TreeNode<Item>[],
  inherited: string,
): readonly FileTreeRow<Item>[] {
  return children.flatMap((child, index) => {
    const last = index === children.length - 1
    const guide = inherited + (last ? BRANCH_LAST : BRANCH_MIDDLE)
    if (child.kind === "file") {
      return [{ kind: "file", guide, name: child.name, item: child.item } as const]
    }
    const folder = joinSingleChain(child)
    return [
      { kind: "folder", guide, name: `${folder.name}/` } as const,
      ...childRows(folder.children, inherited + (last ? GUIDE_BLANK : GUIDE_CONTINUE)),
    ]
  })
}

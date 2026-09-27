// ポートをふさぐための TCP の待ち受け。空いているポートを OS に選ばせる。

import { createServer as createNetServer, type Server as NetServer } from "node:net"

export function listenOnEphemeralPort(): Promise<NetServer> {
  return new Promise((resolve, reject) => {
    const server = createNetServer()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      resolve(server)
    })
  })
}

export function portOf(server: NetServer): number {
  const address = server.address()
  if (address === null || typeof address === "string") {
    throw new Error("ポート番号を取れない")
  }
  return address.port
}

export function closeNetServer(server: NetServer): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve())
  })
}

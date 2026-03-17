/** トンネルで利用する最小限の TCP ソケット抽象。 */
export interface ITcpSocket {
  write(data: Buffer): boolean;
  destroy(): void;
  pause(): void;
  resume(): void;
  on(event: 'data', listener: (chunk: Buffer) => void): this;
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  once(event: 'connect', listener: () => void): this;
}

/** トンネルで利用する最小限の TCP サーバ抽象。 */
export interface ITcpServer {
  listen(port: number, host: string): void;
  close(): void;
}

/** TCP サーバ生成を注入するための抽象。 */
export interface ITcpServerFactory {
  createServer(connectionHandler: (socket: ITcpSocket) => void): ITcpServer;
}

/** TCP クライアント接続生成を注入するための抽象。 */
export interface ITcpClientFactory {
  createConnection(options: { host: string; port: number }): ITcpSocket;
}

/** トンネルで管理される個別 TCP 接続の状態。 */
export interface ConnectionEntry {
  socket: ITcpSocket;
  paused: boolean;
  remoteClosing: boolean;
}

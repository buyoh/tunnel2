/** サーバーから送信される認証チャレンジ。 */
export interface ChallengePayload {
  nonce: string;
}

/** クライアントが送信する認証要求。 */
export interface AuthenticatePayload {
  publicKey: string;
  signature: string;
}

/** サーバーが返す認証結果。 */
export interface AuthResultPayload {
  success: boolean;
  groupName?: string;
  error?: string;
}

/** クライアントが送信するルーム参加要求。 */
export interface JoinPayload {
  mode: 'listen' | 'forward';
  room: string;
}

/** サーバーが返すマッチ結果。 */
export interface MatchedPayload {
  role: 'listen' | 'forward';
}

/** 双方向に流すシグナリングデータ。 */
export interface SignalPayload {
  data: string;
}

/** サーバーが返すエラー通知。 */
export interface ErrorPayload {
  message: string;
}

/** クライアントからサーバーへ送る Socket.IO イベント定義。 */
export interface ClientToServerEvents {
  authenticate: (payload: AuthenticatePayload) => void;
  join: (payload: JoinPayload) => void;
  signal: (payload: SignalPayload) => void;
}

/** サーバーからクライアントへ送る Socket.IO イベント定義。 */
export interface ServerToClientEvents {
  challenge: (payload: ChallengePayload) => void;
  authResult: (payload: AuthResultPayload) => void;
  matched: (payload: MatchedPayload) => void;
  signal: (payload: SignalPayload) => void;
  error: (payload: ErrorPayload) => void;
}
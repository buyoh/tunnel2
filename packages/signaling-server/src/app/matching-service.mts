/** 接続モード。 */
export type MatchingMode = 'listen' | 'forward';

interface RoomEntry {
  listen?: string;
  forward?: string;
}

/** マッチ成立時の結果。 */
export type JoinResult =
  | { matched: false }
  | { matched: true; listenSocketId: string; forwardSocketId: string };

/** ルーム名の許可パターン。 */
export const ROOM_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** ルーム名の形式を検証する。 */
export function validateRoomName(room: string): boolean {
  return ROOM_NAME_PATTERN.test(room);
}

/** ルーム待機とマッチング状態を管理するサービス。 */
export class MatchingService {
  private readonly rooms = new Map<string, RoomEntry>();
  private readonly roomBySocketId = new Map<string, string>();
  private readonly peerBySocketId = new Map<string, string>();

  join(groupName: string, roomName: string, socketId: string, mode: MatchingMode): JoinResult {
    const key = roomKey(groupName, roomName);
    const room = this.rooms.get(key) ?? {};

    if (mode === 'listen' && room.listen) {
      throw new Error('listen client already exists');
    }

    if (mode === 'forward' && room.forward) {
      throw new Error('forward client already exists');
    }

    room[mode] = socketId;
    this.rooms.set(key, room);
    this.roomBySocketId.set(socketId, key);

    if (!room.listen || !room.forward) {
      return { matched: false };
    }

    this.peerBySocketId.set(room.listen, room.forward);
    this.peerBySocketId.set(room.forward, room.listen);

    return {
      matched: true,
      listenSocketId: room.listen,
      forwardSocketId: room.forward,
    };
  }

  getPeerId(socketId: string): string | null {
    return this.peerBySocketId.get(socketId) ?? null;
  }

  leave(socketId: string): { peerSocketId: string | null } {
    const roomKeyValue = this.roomBySocketId.get(socketId);
    const peerSocketId = this.peerBySocketId.get(socketId) ?? null;

    this.peerBySocketId.delete(socketId);
    if (peerSocketId) {
      this.peerBySocketId.delete(peerSocketId);
    }

    if (roomKeyValue) {
      const room = this.rooms.get(roomKeyValue);
      if (room) {
        if (room.listen === socketId) {
          delete room.listen;
        }
        if (room.forward === socketId) {
          delete room.forward;
        }
        if (!room.listen && !room.forward) {
          this.rooms.delete(roomKeyValue);
        } else {
          this.rooms.set(roomKeyValue, room);
        }
      }
      this.roomBySocketId.delete(socketId);
    }

    return { peerSocketId };
  }
}

/** グループ名とルーム名から内部キーを組み立てる。 */
export function roomKey(groupName: string, roomName: string): string {
  return `${groupName}/${roomName}`;
}
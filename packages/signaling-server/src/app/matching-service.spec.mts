import { MatchingService, roomKey, validateRoomName } from './matching-service.mjs';

describe('MatchingService', () => {
  it('listen と forward が揃うとマッチングする', () => {
    const service = new MatchingService();

    expect(service.join('team-alpha', 'room1', 'listen-1', 'listen')).toEqual({ matched: false });
    expect(service.join('team-alpha', 'room1', 'forward-1', 'forward')).toEqual({
      matched: true,
      listenSocketId: 'listen-1',
      forwardSocketId: 'forward-1',
    });
    expect(service.getPeerId('listen-1')).toBe('forward-1');
    expect(service.getPeerId('forward-1')).toBe('listen-1');
  });

  it('同一ルームで同一モードの重複参加を拒否する', () => {
    const service = new MatchingService();
    service.join('team-alpha', 'room1', 'listen-1', 'listen');

    expect(() => service.join('team-alpha', 'room1', 'listen-2', 'listen')).toThrow(
      'listen client already exists',
    );
  });

  it('leave で peer 情報をクリーンアップする', () => {
    const service = new MatchingService();
    service.join('team-alpha', 'room1', 'listen-1', 'listen');
    service.join('team-alpha', 'room1', 'forward-1', 'forward');

    expect(service.leave('listen-1')).toEqual({ peerSocketId: 'forward-1' });
    expect(service.getPeerId('forward-1')).toBeNull();
  });

  it('room 名のバリデーションを行う', () => {
    expect(validateRoomName('room_1')).toBe(true);
    expect(validateRoomName('room-1')).toBe(true);
    expect(validateRoomName('room/1')).toBe(false);
    expect(roomKey('team-alpha', 'room_1')).toBe('team-alpha/room_1');
  });
});
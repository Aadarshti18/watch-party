const { io } = require('socket.io-client');

const URL = 'http://localhost:4123';
let failures = 0;

function assert(cond, msg) {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('PASS:', msg);
  }
}

function connect() {
  return io(URL, { transports: ['websocket'], forceNew: true });
}

async function main() {
  const host = connect();
  const alice = connect();
  const bob = connect();

  await Promise.all([host, alice, bob].map((s) => new Promise((res) => s.on('connect', res))));

  // 1. Create room
  const createRes = await new Promise((res) => host.emit('create_room', { username: 'HostUser' }, res));
  assert(createRes.success, 'host creates room');
  const roomId = createRes.roomId;
  assert(createRes.you.role === 'host', 'creator is assigned host role');

  // 2. Join room
  const aliceJoined = new Promise((res) => host.once('user_joined', res));
  const joinRes = await new Promise((res) => alice.emit('join_room', { roomId, username: 'Alice' }, res));
  assert(joinRes.success, 'alice joins room');
  assert(joinRes.you.role === 'participant', 'joiner defaults to participant role');
  const joinedEvt = await aliceJoined;
  assert(joinedEvt.participants.length === 2, 'host is notified of new participant, roster has 2');

  const bobJoinRes = await new Promise((res) => bob.emit('join_room', { roomId, username: 'Bob' }, res));
  assert(bobJoinRes.success, 'bob joins room');

  // 3. Participant blocked from controlling playback
  const forbiddenErr = new Promise((res) => alice.once('error', res));
  alice.emit('change_video', { videoId: 'dQw4w9WgXcQ' });
  const errEvt = await forbiddenErr;
  assert(errEvt.code === 'FORBIDDEN', 'participant is rejected when changing video');

  // 4. Host changes video -> everyone gets sync_state
  const syncPromises = [host, alice, bob].map((s) => new Promise((res) => s.once('sync_state', res)));
  host.emit('change_video', { videoId: 'dQw4w9WgXcQ' });
  const syncs = await Promise.all(syncPromises);
  assert(syncs.every((s) => s.videoId === 'dQw4w9WgXcQ'), 'all clients receive synced video change');

  // 5. Host promotes Alice to moderator
  const roleEvt = new Promise((res) => alice.once('role_assigned', res));
  host.emit('assign_role', { userId: alice.id, role: 'moderator' });
  const roleRes = await roleEvt;
  assert(roleRes.role === 'moderator', 'alice promoted to moderator');

  // 6. Alice (now moderator) can pause
  const pauseSyncs = [host, alice, bob].map((s) => new Promise((res) => s.once('sync_state', res)));
  alice.emit('pause', { currentTime: 12.5 });
  const pauseRes = await Promise.all(pauseSyncs);
  assert(pauseRes.every((s) => s.playState === 'paused'), 'moderator can pause and it syncs to all');

  // 7. Bob (participant) requests control, host approves
  const requestedEvt = new Promise((res) => host.once('control_requested', res));
  bob.emit('request_control', { action: 'play', payload: { currentTime: 20 } });
  const reqEvt = await requestedEvt;
  assert(reqEvt.username === 'Bob', 'host receives control request from bob');

  const approvedSyncs = [host, alice, bob].map((s) => new Promise((res) => s.once('sync_state', res)));
  const bobApproved = new Promise((res) => bob.once('request_approved', res));
  host.emit('approve_request', { requestId: reqEvt.requestId });
  await bobApproved;
  const approvedRes = await Promise.all(approvedSyncs);
  assert(approvedRes.every((s) => s.playState === 'playing'), 'approved request applies and syncs playback');

  // 8. Host removes Bob
  const removedEvt = new Promise((res) => bob.once('participant_removed', res));
  host.emit('remove_participant', { userId: bob.id });
  const removedRes = await removedEvt;
  assert(removedRes.youWereRemoved === true, 'bob is notified he was removed');

  // 9. Chat
  const chatEvt = new Promise((res) => host.once('chat_message', res));
  alice.emit('chat_message', { text: 'hello from alice' });
  const chatRes = await chatEvt;
  assert(chatRes.text === 'hello from alice', 'chat message is broadcast');

  host.close();
  alice.close();
  bob.close();

  console.log(failures === 0 ? '\nALL INTEGRATION TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('Integration test crashed:', err);
  process.exit(1);
});

# tunnel2

A P2P TCP tunnel using node-datachannel.

## How to use

This guide shows how to establish a TCP tunnel between two machines (referred to as Alice and Bob).
Alice listens on a local port, and Bob forwards traffic to the destination.

### CLI Mode

Use `npm run start` for interactive operation.

#### Alice (listen side)

```bash
npm run start -- listen 8080
```

- After listening, the offer info (Base64 string) is displayed in the console.
- Send this offer info to Bob.

When you receive the answer info from Bob, paste it into the prompt and press Enter.

#### Bob (forward side)

```bash
npm run start -- forward localhost:3000
```

- When you receive the offer info from Alice, paste it into the prompt and press Enter.
- The answer info is displayed in the console — send it to Alice.

#### Overall flow

1. **Alice**: Run `npm run start -- listen <port>`
2. **Alice**: Send the displayed offer info to Bob
3. **Bob**: Run `npm run start -- forward <host:port>`
4. **Bob**: Paste Alice's offer info into the prompt
5. **Bob**: Send the displayed answer info to Alice
6. **Alice**: Paste Bob's answer info into the prompt
7. P2P connection is established — connections to Alice's `<port>` are forwarded to Bob's `<host:port>`

### Daemon Mode

Use shell scripts to run in the background.
All scripts identify the daemon via the `--id <id>` option (defaults to `default` if omitted).
Multiple daemons can run simultaneously in the same environment by specifying different IDs.

#### Starting and stopping the daemon

```bash
# Start
scripts/daemon-start.sh
scripts/daemon-start.sh --id alice

# Check status
scripts/daemon-status.sh
scripts/daemon-status.sh --id alice

# Stop
scripts/daemon-stop.sh
scripts/daemon-stop.sh --id alice
```

#### Sending commands

```bash
scripts/daemon-post.sh [--id <id>] <action> [key=value ...]
```

#### Connection steps in daemon mode

```bash
# 1. Alice: Start listening
scripts/daemon-post.sh --id alice listen port=8080

# 2. Alice: Retrieve offer info from status and send to Bob
scripts/daemon-status.sh --id alice

# 3. Bob: Start forwarding
scripts/daemon-post.sh --id bob forward host=localhost port=3000

# 4. Bob: Set Alice's offer info
scripts/daemon-post.sh --id bob set-remote-offer encoded="<Alice's offer info>"

# 5. Bob: Retrieve answer info from status and send to Alice
scripts/daemon-status.sh --id bob

# 6. Alice: Set Bob's answer info
scripts/daemon-post.sh --id alice set-remote-answer encoded="<Bob's answer info>"

# 7. Connection established — use close to disconnect
scripts/daemon-post.sh --id alice close
```

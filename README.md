# Rocket.Chat LastMessage Watchdog

This project provides a Node.js script that acts as a "watchdog" to monitor a Rocket.Chat MongoDB database. It specifically watches for a bug where a room's `lastMessage` object is created without a timestamp (`ts`), which can cause the mobile and web clients to crash.

When the watchdog detects such a malformed object, it immediately removes the `lastMessage` field from the affected room document, preventing the UI crash and allowing the application to recover gracefully. https://github.com/RocketChat/Rocket.Chat/issues/40503

## Prerequisites

*   **Docker & Docker Compose:** To run the Rocket.Chat and MongoDB environment.
*   **Node.js:** To run the `watchdog.js` script.
*   **Administrator/sudo access:** To edit the `/etc/hosts` file.

## Setup

### 1. Configure Host File

This script runs on your host machine and connects to a MongoDB instance inside a Docker container. Because the MongoDB replica set identifies itself using its Docker service name (`mongodb`), you must map this hostname to your localhost IP address.

Add the following line to the file and save it:
```
127.0.0.1    mongodb
```
This tells your machine to direct any requests for `mongodb` to `127.0.0.1`, allowing the Node.js driver to connect correctly to the replica set member running in Docker.

### 2. Install Dependencies

The script depends on the official MongoDB Node.js driver. Install it using npm:
```sh
npm i
```

## How to Run

1.  **Start the Rocket.Chat Environment:**
    Make sure your `docker-compose.yml` is configured and run:
    ```sh
    docker-compose up -d
    ```

2.  **Start the Watchdog:**
    In a separate terminal, run the watchdog script:
    ```sh
    node watchdog.js
    ```
    If the connection is successful, you will see the following message:
    ```
    Connected to MongoDB. Sniffing for corrupted lastMessage objects...
    ```
    The script is now actively monitoring the database for any new occurrences of the issue.

## Manual Cleanup for Existing Data

If your database already contains corrupted `lastMessage` objects from before you started the watchdog, you can run a one-time command to clean them all up.

To do this, connect to the MongoDB shell and run the following command. It will find all channels (`t: 'c'`) where `lastMessage` exists but is missing the `ts` field, and it will remove the `lastMessage` object from them.

```javascript
db.rocketchat_room.updateMany(
  {
    t: 'c',
    lastMessage: { $exists: true, $ne: null },
    "lastMessage.ts": { $exists: false }
  },
  { $unset: { lastMessage: "" } }
)
```

## How to Test the Watchdog

To verify that the watchdog is working, you can manually introduce the "corrupted" data into a room document.

1.  **Connect to the MongoDB Shell:**
    Open a new terminal and get a shell inside the MongoDB container:
    ```sh
    docker compose exec mongodb mongosh rocketchat
    ```

3.  **Find a Room:**
    Locate the "general" channel to get its `_id`:
    ```mongosh
    db.rocketchat_room.findOne({ name: 'general' })
    ```

4.  **Perform the Corrupting Update:**
    Execute an `updateOne` command to set a `lastMessage` object that is missing the required `ts` field. Use the `_id` you found (it's often `'GENERAL'`).
    ```javascript
    db.rocketchat_room.updateOne(
      { _id: 'GENERAL' },
      { $set: { lastMessage: { msg: 'This is a test message without a timestamp' } } }
    )
    ```

5.  **Observe the Watchdog Output:**
    Immediately after running the update, check the terminal where `watchdog.js` is running. You should see the script detect the bug and fix it:
    ```
    [2026-05-13TXX:XX:XX.XXX] BUG DETECTED: Room "general" (GENERAL) has a malformed lastMessage.
    [2026-05-13TXX:XX:XX.XXX] FIXED: lastMessage removed from "general".
    ```
This confirms that your watchdog is correctly configured and functioning as expected.

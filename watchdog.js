const { MongoClient } = require('mongodb');

// Adjust the URI if your MongoDB uses a different port or replica set name
const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/rocketchat?replicaSet=rs0';
const dbName = 'rocketchat';

async function startWatchdog() {
    const client = new MongoClient(uri);

    try {
        await client.connect();
        console.log("Connected to MongoDB. Sniffing for corrupted lastMessage objects...");

        const db = client.db(dbName);
        const collection = db.collection('rocketchat_room');

        // Filter: Watch for updates where lastMessage is added BUT lacks a timestamp (ts)
        const pipeline = [
            {
                $match: {
                    'operationType': 'update',
                    'updateDescription.updatedFields.lastMessage': { $exists: true },
                    'updateDescription.updatedFields.lastMessage.ts': { $exists: false }
                }
            }
        ];

        // fullDocument: 'updateLookup' allows us to see the room name in logs
        const changeStream = collection.watch(pipeline, { fullDocument: 'updateLookup' });

        changeStream.on('change', async (change) => {
            const roomId = change.documentKey._id;
            const roomName = change.fullDocument ? (change.fullDocument.name || change.fullDocument.fname) : 'Unknown';

            console.log(`[${new Date().toISOString()}] BUG DETECTED: Room "${roomName}" (${roomId}) has a malformed lastMessage.`);

            // The Fix: Remove the field immediately so the UI doesn't crash
            await collection.updateOne(
                { _id: roomId },
                { $unset: { lastMessage: "" } }
            );

            console.log(`[${new Date().toISOString()}] FIXED: lastMessage removed from "${roomName}".`);
        });

        // Keep the process alive and handle stream errors
        changeStream.on('error', (err) => {
            console.error("Change Stream error, restarting...", err);
            client.close();
            setTimeout(startWatchdog, 5000);
        });

    } catch (err) {
        console.error("Connection failed, retrying in 5s...", err);
        setTimeout(startWatchdog, 5000);
    }
}

startWatchdog();

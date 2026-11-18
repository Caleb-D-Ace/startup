const { MongoClient, ServerApiVersion } = require('mongodb');
const config = require('./dbConfig.json');
const url = `mongodb+srv://${config.userName}:${config.password}@${config.hostname}`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(url, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
const db = client.db('paintwall');
// User collection: { username, password, tokens, xp, lastActive, profile }
const userCollection = db.collection('users');
// Pixel collection: { _id: "x,y", paletteIndex, userID, paintedAt }
const pixelCollection = db.collection('pixels')

// --- Users ---

/** @returns {object|null} the user document for this username, or null if none exists */
async function getUserByUsername(username) {
  return userCollection.findOne({username: username});
}

/**
 * @returns {object|null} the user document whose tokens array contains this
 * token, or null. Mongo matches an array-field query like this against any
 * element of the array automatically -- no special operator needed.
 */
async function getUserByToken(token) {
  return userCollection.findOne({tokens: token});
}

/** Inserts a brand-new user document. */
async function addUser(user) {
  await userCollection.insertOne(user);
}

/**
 * Writes changes to an existing user document back to the database.
 * Known inefficiency, accepted for now: this is a whole-document
 * write, not a targeted $push/$pull/$inc -- fine for this project's scale,
 * worth revisiting (a race on concurrent updates to the same user) later.
 */
// Changes: { xp: newXP, lastActive: now }
async function updateUser(username, changes) {
  await userCollection.updateOne({ username: username }, { $set: changes });
}

// --- Avatars ---

/** @returns {{x:number,y:number,paletteIndex:number}[]|null} this user's saved avatar pixels, or null if none saved yet */
async function getUserAvatar(username) {
  const user = await userCollection.findOne({ username: username }, { projection: { profile: 1, _id: 0 } });
  return user?.profile ?? null; // this is a cool bit of syntax. '?' handles null user, '??' handles nonexistent avatars.
}

/** Saves/overwrites this user's avatar pixel data. */
async function saveUserAvatar(username, pixels) {
  await userCollection.updateOne({ username: username }, { $set: { profile: pixels } });
}

// --- Wall / pixels ---

/** @returns {object|null} the pixel document at (x, y), or null if unpainted */
async function getPixel(x, y) {
  return pixelCollection.findOne({ _id: `${x},${y}` });
}

/** @returns {object[]} every currently-painted pixel */
async function getCanvas() {
  return pixelCollection.find({}).toArray();
}

/**
 * Upserts a batch of pixels in one round trip (one bulkWrite, not one
 * network call per cell) -- insert-or-overwrite per cell, since repainting
 * an already-painted cell is normal, expected behavior here.
 * @param {{x:number, y:number, paletteIndex:number, userID:string, paintedAt:number}[]} pixels
 */
async function addPixels(pixels) {
  if (pixels.length === 0) {
    return;
  }
  const operations = pixels.map((pixel) => ({
    updateOne: {
      filter: { _id: `${pixel.x},${pixel.y}` },
      update: { $set: { paletteIndex: pixel.paletteIndex, userID: pixel.userID, paintedAt: pixel.paintedAt } },
      upsert: true,
    },
  }));
  await pixelCollection.bulkWrite(operations);
}

/** Deletes every pixel document -- wipes the wall. */
async function clearCanvas() {
  await pixelCollection.deleteMany({});
}

// --- Leaderboard ---

/** @returns {object[]} users with xp > 0, sorted descending by xp */
async function getLeaderboard() {
  return userCollection
    .find({ xp: { $gt: 0 } }, { projection: { username: 1, xp: 1, lastActive: 1, _id: 0 } })
    .sort({ xp: -1 })
    .toArray();
}

module.exports = {
  getUserByUsername,
  getUserByToken,
  addUser,
  updateUser,
  getUserAvatar,
  saveUserAvatar,
  getPixel,
  getCanvas,
  addPixels,
  clearCanvas,
  getLeaderboard,
};


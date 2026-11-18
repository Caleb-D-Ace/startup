const express = require ('express');
const bcrypt = require ('bcryptjs');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const { rasterizeStroke, getLevel } = require('./gameLogic');
const database = require ('./database');

const app = express();
const port = process.argv.length > 2 ? process.argv[2] : 4000;
app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());

const authCookieName = 'token';

// Duplicated from canvasApi.js rather than imported -- that module touches
// window/localStorage and would crash under Node. These two numbers are
// simple enough that copying them carries far less drift risk than
// reimplementing the actual rasterization algorithm would.
const CANVAS_WIDTH = 854;
const CANVAS_HEIGHT = 480;

// Mints a fresh token for this login, remembers it on the user (so several
// browsers/devices can be logged in as the same user at once), and sets it
// as an httpOnly cookie so client JS never has direct access to it.
async function createSession(res, user) {
  const token = uuidv4();
  user.tokens.push(token);
  await database.updateUser(user.username, { tokens: user.tokens });
  res.cookie(authCookieName, token, {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    secure: true,
    httpOnly: true,
    sameSite: 'strict',
  });
}

// Shared by every "who is this user" response (create, login, user/me) so
// the header's xp/level is never stale -- without this, a returning user
// would see 0 xp right after logging in, until their next stroke response
// happened to carry the real value.
function userSummary(user) {
  const xp = user.xp ?? 0;
  return { username: user.username, xp, level: getLevel(xp) };
}

const apiRouter = express.Router();
app.use('/api', apiRouter);

// Register/log in a new user
apiRouter.post('/auth/create', async (req, res) => {
  const { username, password } = req.body;
  if (!username) {
    return res.status(400).send({ msg: 'Username (and password, if username has one) required' });
  }
  if (await database.getUserByUsername(username)) {
    return res.status(409).send({ msg: 'Existing user' });
  }

  const user = {
    username,
    password: await bcrypt.hash(password ?? '', 10),
    // One token per login, so the same user can be logged in from several browsers
    tokens: [],
  };
  await database.addUser(user);

  await createSession(res, user);
  res.send(userSummary(user));
});

// Log in an existing user
apiRouter.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await database.getUserByUsername(username);
  if (user && (await bcrypt.compare(password ?? '', user.password))) {
    await createSession(res, user);
    return res.send(userSummary(user));
  }
  res.status(401).send({ msg: 'Unauthorized' });
});

// Log out the current user
apiRouter.delete('/auth/logout', async (req, res) => {
  const token = req.cookies[authCookieName];
  const user = await database.getUserByToken(token);
  if (user) {
    const tokens = user.tokens.filter((t) => t !== token);
    await database.updateUser(user.username, { tokens });
  }
  res.clearCookie(authCookieName);
  res.status(204).end();
});

// Middleware that rejects requests without a valid auth cookie
const verifyAuth = async (req, res, next) => {
  const user = await database.getUserByToken(req.cookies[authCookieName]);
  if (user) {
    req.user = user;
    next();
  } else {
    res.status(401).send({ msg: 'Unauthorized' });
  }
};

// Returns who is logged in, so the frontend can restore state on reload
apiRouter.get('/user/me', verifyAuth, (req, res) => {
  res.send(userSummary(req.user));
});

// Reshapes the database's returned pixels collection into the frontend's expected
// object shape: "x,y" -> {paletteIndex, username, paintedAt}
function canvasToWallState(pixels) {
  const wallState = {};
  pixels.forEach((pixel) => {
    wallState[pixel._id] = {
      paletteIndex: pixel.paletteIndex,
      username: pixel.userID,
      paintedAt: pixel.paintedAt,
    };
  });
  return wallState;
}

// Reshapes the database's returned pixel document into the frontend's expected shape
// {paletteIndex, username, paintedAt} or null
function formatPixel(pixel) {
  if (!pixel) {
    return null;
  }
  return {
    paletteIndex: pixel.paletteIndex,
    username: pixel.userID,
    paintedAt: pixel.paintedAt,
  };
}

// Current wall pixel state, for initial page load. Public -- anyone can
// view the wall, logged in or not.
apiRouter.get('/wall', async (req, res) => {
  const canvas = await database.getCanvas();
  res.send(canvasToWallState(canvas));
});

// Get the currently selected pixel
apiRouter.get('/wall/pixel/:x/:y', async (req, res) => {
  const { x, y } = req.params;
  const pixel = await database.getPixel(x, y);
  res.json(formatPixel(pixel));
});

// Submit a stroke. Protected -- painting requires a logged-in identity,
// which the server derives from the auth token instead of trusting a
// client-supplied username. Rasterizes, writes into in-memory wall state,
// adds xp to req.user, and responds with { pixels, username, xp, level } --
// username is included at the top level (not just per-pixel) so the
// response is still meaningful when a stroke rasterizes to zero pixels.
apiRouter.post('/wall/strokes', verifyAuth, async (req, res) => {
  const { points, shape, size, paletteIndex } = req.body;
  if (!Array.isArray(points)) {
    return res.status(400).send({ msg: 'points required' });
  }

  const cells = rasterizeStroke({ points, shape, size }, CANVAS_WIDTH, CANVAS_HEIGHT);
  const paintedAt = Date.now();

  const pixels = cells.map(({ x, y }) => ({ x, y, paletteIndex, username: req.user.username }));
  const dbPixels = pixels.map((pixel) => ({ ...pixel, userID: pixel.username, paintedAt }));

  const xp = (req.user.xp ?? 0) + pixels.length;
  const lastActive = paintedAt;

  // Independent writes (different collections, no data dependency between
  // them) -- run them concurrently rather than one after the other, since
  // this route is the hottest path in the app (a chunk flushes every
  // ~250ms during an active drag).
  await Promise.all([
    database.addPixels(dbPixels),
    database.updateUser(req.user.username, { xp, lastActive }),
  ]);

  res.send({ pixels, username: req.user.username, xp, level: getLevel(xp) });
});

// Clears the wall. Protected -- powers the existing "Clear Canvas" testing
// button.
apiRouter.delete('/wall', verifyAuth, async (req, res) => {
  await database.clearCanvas();
  res.status(204).end();
});

// Leaderboard. Public -- database.getLeaderboard() already filters to xp > 0
// and sorts descending, matching the old in-memory behavior.
apiRouter.get('/leaderboard', async (req, res) => {
  const leaderboard = await database.getLeaderboard();
  res.send(leaderboard);
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
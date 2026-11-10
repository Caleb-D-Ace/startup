const express = require ('express');
const bcrypt = require ('bcryptjs');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

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

// Create our empty lists for temp storage
const users = [];

// Every currently-painted pixel, keyed "x,y" -> { paletteIndex, username,
// paintedAt }. Sparse on purpose -- most of an 854x480 wall stays unpainted.
//
// TODO(DB deliverable): once users live in a real table with an id, store
// that int here instead of the username string -- a username repeats at
// every pixel it painted, so interning it to a small int saves thousands of
// bytes across a painted wall.
const wallState = {};

function getUserByUsername(username) {
  return users.find((u) => u.username === username);
}

function getUserByToken(token) {
  return users.find((u) => u.tokens.includes(token));
}

// Mints a fresh token for this login, remembers it on the user (so several
// browsers/devices can be logged in as the same user at once), and sets it
// as an httpOnly cookie so client JS never has direct access to it.
function createSession(res, user) {
  const token = uuidv4();
  user.tokens.push(token);
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
async function userSummary(user) {
  const { getLevel } = await import('../src/canvas/xp.js');
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
  if (getUserByUsername(username)) {
    return res.status(409).send({ msg: 'Existing user' });
  }

  const user = {
    username,
    password: await bcrypt.hash(password ?? '', 10),
    // One token per login, so the same user can be logged in from several browsers
    tokens: [],
  };
  users.push(user);

  createSession(res, user);
  res.send(await userSummary(user));
});

// Log in an existing user
apiRouter.post('/auth/login', async (req, res) => {
  const user = getUserByUsername(req.body.username);
  if (user && (await bcrypt.compare(req.body.password ?? '', user.password))) {
    createSession(res, user);
    return res.send(await userSummary(user));
  }
  res.status(401).send({ msg: 'Unauthorized' });
});

// Log out the current user
apiRouter.delete('/auth/logout', (req, res) => {
  const token = req.cookies[authCookieName];
  const user = getUserByToken(token);
  if (user) {
    user.tokens = user.tokens.filter((t) => t !== token);
  }
  res.clearCookie(authCookieName);
  res.status(204).end();
});

// Middleware that rejects requests without a valid auth cookie
const verifyAuth = (req, res, next) => {
  const user = getUserByToken(req.cookies[authCookieName]);
  if (user) {
    req.user = user;
    next();
  } else {
    res.status(401).send({ msg: 'Unauthorized' });
  }
};

// Returns who is logged in, so the frontend can restore state on reload
apiRouter.get('/user/me', verifyAuth, async (req, res) => {
  res.send(await userSummary(req.user));
});

// Current wall pixel state, for initial page load. Public -- anyone can
// view the wall, logged in or not.
apiRouter.get('/wall', (req, res) => {
  res.send(wallState);
});

// Get the currently selected pixel
apiRouter.get('/wall/pixel/:x/:y', (req, res) => {
  const { x, y } = req.params;
  res.json(wallState[`${x},${y}`] ?? null);
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

  // Dynamic import -- these are ES modules shared with the frontend, loaded
  // from a CommonJS file. Node caches the module after the first call, so
  // this isn't a disk read per stroke.
  const { rasterizeStroke } = await import('../src/canvas/brush.js');
  const { getLevel } = await import('../src/canvas/xp.js');

  const cells = rasterizeStroke({ points, shape, size }, CANVAS_WIDTH, CANVAS_HEIGHT);
  const paintedAt = Date.now();

  const pixels = cells.map(({ x, y }) => {
    wallState[`${x},${y}`] = { paletteIndex, username: req.user.username, paintedAt };
    return { x, y, paletteIndex, username: req.user.username };
  });

  req.user.xp = (req.user.xp ?? 0) + pixels.length;
  req.user.lastActive = paintedAt;

  res.send({ pixels, username: req.user.username, xp: req.user.xp, level: getLevel(req.user.xp) });
});

// Clears the wall. Protected -- powers the existing "Clear Canvas" testing
// button.
apiRouter.delete('/wall', verifyAuth, (req, res) => {
  Object.keys(wallState).forEach(k => delete wallState[k]);
});

// Leaderboard. Public, reads from the same in-memory xp data strokes write
// to. Only users who've actually painted (xp > 0) show up, matching the
// mock's behavior -- every freshly-registered user otherwise crowds the
// board with zero-xp rows nobody wants to see.
apiRouter.get('/leaderboard', (req, res) => {
  const leaderboard = users
    .filter((u) => (u.xp ?? 0) > 0)
    .map((u) => ({ username: u.username, xp: u.xp, lastActive: u.lastActive ?? null }))
    .sort((a, b) => b.xp - a.xp);
  res.send(leaderboard);
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
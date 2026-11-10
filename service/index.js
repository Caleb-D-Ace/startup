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

// Create our empty lists for temp storage
const users = [];

// Every currently-painted pixel, keyed "x,y" -> { paletteIndex, username,
// paintedAt }. Sparse on purpose -- most of an 854x480 wall stays unpainted.
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
  res.send({ username: user.username });
});

// Log in an existing user
apiRouter.post('/auth/login', async (req, res) => {
  const user = getUserByUsername(req.body.username);
  if (user && (await bcrypt.compare(req.body.password ?? '', user.password))) {
    createSession(res, user);
    return res.send({ username: user.username });
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
apiRouter.get('/user/me', verifyAuth, (req, res) => {
  res.send({ username: req.user.username });
});

// --- Stubs below: signatures/routes only, not implemented yet ---

// Current wall pixel state, for initial page load. Public -- anyone can
// view the wall, logged in or not.
apiRouter.get('/wall', (req, res) => {
  res.send(wallState);
});

// Submit a stroke. Protected -- painting requires a logged-in identity,
// which the server now derives from the auth token instead of trusting a
// client-supplied username. Should rasterize the stroke, write the
// resulting pixels into in-memory wall state, add xp to req.user, and
// respond with { pixels, xp, level }.
apiRouter.post('/wall/strokes', verifyAuth, (req, res) => {
  res.status(501).send({ msg: 'Not implemented yet' });
});

// Clears the wall. Protected -- powers the existing "Clear Canvas" testing
// button.
apiRouter.delete('/wall', verifyAuth, (req, res) => {
  res.status(501).send({ msg: 'Not implemented yet' });
});

// Leaderboard. Public, reads from the same in-memory xp data strokes write to.
apiRouter.get('/leaderboard', (req, res) => {
  res.status(501).send({ msg: 'Not implemented yet' });
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
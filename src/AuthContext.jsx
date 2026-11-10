import React, { createContext, useContext, useState, useEffect } from 'react';

// Shared login state. AuthPanel (in the header) and Profile (a routed page)
// both need to know who's logged in, but neither is an ancestor of the
// other -- without this, Profile would have to read localStorage on its own
// and would go stale the moment you log in/out without navigating away and
// back, since the header is always mounted but Profile wouldn't know its
// state changed.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [username, setUsername] = useState(null);
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState(1);

  // Same cross-component staleness problem as username, for the saved
  // avatar: AvatarIcon (header) and Profile's "Set Avatar" button are also
  // not in an ancestor/descendant relationship, so without a shared signal
  // the header icon would only ever reflect the avatar as of login, not
  // whatever was last saved. notifyAvatarChanged bumps this; AvatarIcon
  // depends on it to know when to re-read the saved pixels.
  const [avatarVersion, setAvatarVersion] = useState(0);

  // The httpOnly auth cookie is the real source of truth now, not
  // localStorage -- ask the server who (if anyone) it belongs to.
  useEffect(() => {
    fetch('/api/user/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) {
          setUsername(data.username);
          setXp(data.xp);
          setLevel(data.level);
        }
      })
      .catch(() => {
        // service unreachable -- just stay logged out client-side
      });
  }, []);

  function notifyAvatarChanged() {
    setAvatarVersion((v) => v + 1);
  }

  // One login button doubles as register: try to create the account first,
  // and only fall back to a real login call if that username is already
  // taken. Matches the two conventional auth endpoints on the server --
  // no special merged "create-or-login" endpoint needed.
  async function login(name, password) {
    const headers = { 'Content-Type': 'application/json' };
    const body = JSON.stringify({ username: name, password });

    let response = await fetch('/api/auth/create', { method: 'POST', headers, body });
    if (response.status === 409) {
      response = await fetch('/api/auth/login', { method: 'POST', headers, body });
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { ok: false, error: data.msg || 'Login failed' };
    }

    const data = await response.json();
    setUsername(data.username);
    setXp(data.xp);
    setLevel(data.level);
    return { ok: true };
  }

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'DELETE' });
    } catch {
      // service unreachable -- still clear client-side state below
    }
    setUsername(null);
    setXp(0);
    setLevel(1);
  }

  // Lets a stroke response update xp/level directly (POST /wall/strokes
  // already returns the painting user's new totals) instead of making the
  // header re-fetch /api/user/me after every ~250ms stroke chunk.
  function updateXp(newXp, newLevel) {
    setXp(newXp);
    setLevel(newLevel);
  }

  return (
    <AuthContext.Provider
      value={{ username, login, logout, avatarVersion, notifyAvatarChanged, xp, level, updateXp }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

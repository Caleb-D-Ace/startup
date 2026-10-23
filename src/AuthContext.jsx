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

  // Same cross-component staleness problem as username, for the saved
  // avatar: AvatarIcon (header) and Profile's "Set Avatar" button are also
  // not in an ancestor/descendant relationship, so without a shared signal
  // the header icon would only ever reflect the avatar as of login, not
  // whatever was last saved. notifyAvatarChanged bumps this; AvatarIcon
  // depends on it to know when to re-read the saved pixels.
  const [avatarVersion, setAvatarVersion] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem('paintwall-username');
    if (saved) {
      setUsername(saved);
    }
  }, []);

  function notifyAvatarChanged() {
    setAvatarVersion((v) => v + 1);
  }

  function login(name) {
    try {
      localStorage.setItem('paintwall-username', name);
    } catch {
      // localStorage full or unavailable -- fine for a mock, login just
      // won't persist across a reload.
    }
    setUsername(name);
  }

  function logout() {
    try {
      localStorage.removeItem('paintwall-username');
    } catch {
      // fine for a mock
    }
    setUsername(null);
  }

  return (
    <AuthContext.Provider value={{ username, login, logout, avatarVersion, notifyAvatarChanged }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

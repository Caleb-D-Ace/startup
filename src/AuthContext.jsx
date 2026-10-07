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

  useEffect(() => {
    const saved = localStorage.getItem('paintwall-username');
    if (saved) {
      setUsername(saved);
    }
  }, []);

  function login(name) {
    localStorage.setItem('paintwall-username', name);
    setUsername(name);
  }

  function logout() {
    localStorage.removeItem('paintwall-username');
    setUsername(null);
  }

  return (
    <AuthContext.Provider value={{ username, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

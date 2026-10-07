import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.css';

// Replaces public/js/auth.js's imperative DOM manipulation (getElementById +
// toggling .hidden) with React state. That old script and React both tried
// to own the same #auth-form/#profile-panel nodes, which put the DOM out of
// sync with what React thought it had rendered -- this component is the fix,
// not just a port: login state now lives in React, so there's nothing left
// for a separate script to fight over.
function AuthPanel() {
  const [loggedInAs, setLoggedInAs] = useState(null);
  const [username, setUsername] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('paintwall-username');
    if (saved) {
      setLoggedInAs(saved);
    }
  }, []);

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = username.trim();
    if (!trimmed) {
      return;
    }
    localStorage.setItem('paintwall-username', trimmed);
    setLoggedInAs(trimmed);
    setUsername('');
  }

  function handleLogout() {
    localStorage.removeItem('paintwall-username');
    setLoggedInAs(null);
  }

  if (loggedInAs) {
    return (
      <div id="header-auth" className="site-auth">
        <div id="profile-panel">
          <span>
            Welcome, <span id="current-username">{loggedInAs}</span>{' '}
            <span id="user-level">(Level 3)</span>
          </span>
          <meter id="header-xp-bar" min="0" max="1000" value="420" aria-label="Experience toward next level"></meter>
          <button type="button" id="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
      </div>
    );
  }

  return (
    <div id="header-auth" className="site-auth">
      <form id="auth-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            name="username"
            placeholder="Username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input type="password" id="password" name="password" placeholder="Password" />
        </div>

        <button type="submit" id="login-btn">Login</button>
      </form>
      <p id="register-hint">New here? Just enter a username and click Login to create an account.</p>
    </div>
  );
}

export default function App() {
  return (<div className="body bg-dark text-light">
    <header className="site-header">
      <div id="brand">
        <h1 className="brand-logo"><a href="wall.html"><img src="images/paintwall_logo.png" alt="Paintwall home" /></a></h1>

        <input type="checkbox" id="nav-auth-toggle" className="auth-toggle-input" />
        <label htmlFor="nav-auth-toggle" className="hamburger-btn">
          <img src="images/hamburger_icon.png" alt="Account menu" />
        </label>
      </div>

      <nav className="site-nav">
        <ul>
          <li><a href="wall.html">The Wall</a></li>
          <li><a href="artists.html">Top Artists</a></li>
          <li><a href="profile.html">My Avatar</a></li>
          <li><a href="about.html">About</a></li>
        </ul>
      </nav>

      <AuthPanel />
    </header>

    <main>App components go here</main>

    <footer className="site-footer">
      <p>
        Paintwall &mdash; a startup project by Caleb D for CS 260.
        <a href="https://github.com/Caleb-D-Ace/startup" target="_blank" rel="noopener">View source on GitHub</a>
      </p>

    </footer>
  </div>);
}

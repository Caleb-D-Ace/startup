import React, { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.css';
import { BrowserRouter, NavLink, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import {Wall} from './wall/wall'
import {Artists} from './artists/artists'
import {Profile} from './profile/profile'
import {About} from './about/about'

export default function App() {
    return (
        <BrowserRouter>
          <AuthProvider>
            <div className="body bg-dark text-light">
                <header className="site-header">
                <div id="brand">
                    <h1 className="brand-logo"><NavLink to="/"><img src="images/paintwall_logo.png" alt="Paintwall home" /></NavLink></h1>
                </div>

                <nav className="site-nav">
                    <ul>
                    <li><NavLink to="/"><span className="nav-label-full">The Wall</span><span className="nav-label-short">Wall</span></NavLink></li>
                    <li><NavLink to="/artists"><span className="nav-label-full">Top Artists</span><span className="nav-label-short">Artists</span></NavLink></li>
                    <li><NavLink to="/profile"><span className="nav-label-full">My Avatar</span><span className="nav-label-short">Avatar</span></NavLink></li>
                    <li className="nav-about-wide"><NavLink to="/about">About</NavLink></li>
                    </ul>
                </nav>

                <input type="checkbox" id="nav-auth-toggle" className="auth-toggle-input" />
                <label htmlFor="nav-auth-toggle" className="hamburger-btn">
                <img src="images/hamburger_icon.png" alt="Account menu" />
                </label>
                <label htmlFor="nav-auth-toggle" className="auth-backdrop" aria-hidden="true"></label>

                <AuthPanel />
                </header>

                <main>
                    <Routes>
                        <Route path="/" element={<Wall />} />
                        <Route path="/artists" element={<Artists />} />
                        <Route path="/profile" element={<Profile />} />
                        <Route path="/about" element={<About />} />
                    </Routes>
                </main>

                <footer className="site-footer">
                <p>
                    Paintwall &mdash; a startup project by Caleb D for CS 260.
                    <a href="https://github.com/Caleb-D-Ace/startup" target="_blank" rel="noopener"> View source on GitHub</a>
                </p>

                </footer>
            </div>
          </AuthProvider>
        </BrowserRouter>
    );
}

// Replaces public/js/auth.js's imperative DOM manipulation (getElementById +
// toggling .hidden) with React state. That old script and React both tried
// to own the same #auth-form/#profile-panel nodes, which put the DOM out of
// sync with what React thought it had rendered -- this component is the fix,
// not just a port: login state now lives in React, so there's nothing left
// for a separate script to fight over.
function AuthPanel() {
  const { username: loggedInAs, login, logout } = useAuth();
  const [usernameInput, setUsernameInput] = useState('');

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = usernameInput.trim();
    if (!trimmed) {
      return;
    }
    login(trimmed);
    setUsernameInput('');
  }

  function handleLogout() {
    logout();
  }

  if (loggedInAs) {
    return (
      <div id="header-auth" className="site-auth">
        <div id="profile-panel">
          <span className="profile-greeting">
            Welcome, <span id="current-username">{loggedInAs}</span>{' '}
            <span id="user-level">(Level 3)</span>
          </span>
          <meter id="header-xp-bar" min="0" max="1000" value="420" aria-label="Experience toward next level"></meter>
          <button type="button" id="logout-btn" onClick={handleLogout}>Logout</button>
        </div>
        <NavLink to="/about" className="about-link">About</NavLink>
      </div>
    );
  }

  return (
    <div id="header-auth" className="site-auth">
      <form id="auth-form" onSubmit={handleSubmit}>
        <div className="field field-tooltip-wrap">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            name="username"
            placeholder="Username"
            required
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
          />
          <p className="field-tooltip" role="tooltip">
            New here? Just enter a username and click Login to create an account.
          </p>
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input type="password" id="password" name="password" placeholder="Password" />
        </div>

        <button type="submit" id="login-btn">Login</button>
      </form>
      <NavLink to="/about" className="about-link">About</NavLink>
    </div>
  );
}


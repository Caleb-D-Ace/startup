import React from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './app.css';

export default function App() {
  return (<div className="body bg-dark text-light">
    <header className="site-header">
      <div id="brand">
        <h1 className="brand-logo"><a href="wall.html"><img src="images/paintwall_logo.png" alt="Paintwall home" /></a></h1>

        <input type="checkbox" id="nav-auth-toggle" className="auth-toggle-input" />
        <label for="nav-auth-toggle" className="hamburger-btn">
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

      {/* <!-- Authentication placeholder --> */}
      <div id="header-auth" className="site-auth">
        <form id="auth-form" action="#" method="post">
          <div className="field">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" placeholder="Username" required />
          </div>

          <div className="field">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="Password" />
          </div>

          <button type="submit" id="login-btn">Login</button>
        </form>
        <p id="register-hint">New here? Just enter a username and click Login to create an account.</p>

        <div id="profile-panel" hidden>
          <span>
            Welcome, <span id="current-username">CalebD</span>
            <span id="user-level">(Level 3)</span>
          </span>
          <meter id="header-xp-bar" min="0" max="1000" value="420" aria-label="Experience toward next level"></meter>
          <button type="button" id="logout-btn">Logout</button>
        </div>
      </div>
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
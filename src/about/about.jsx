import React from 'react';

export function About() {
  return (
    <main>
      <section id="pitch-section" className="panel">
        <h2>Co-op Graffiti Canvas</h2>
        <p>
          Shared digital canvases such as r/place have become massive community events, but they
          are time-limited by nature. What if there was a public canvas that simply&hellip;
          stayed? Paintwall is a public digital graffiti wall where every pixel remembers who drew
          it. Featuring digital paint tools, a real-time shared canvas, and individual attribution
          for every drawing, Paintwall is a fun and creative application that showcases the power
          of WebSocket and individual artists.
        </p>

        <figure>
          <img src="images/app_mockup.png" alt="Sequence diagram and mockup of the Paintwall application" />
          <figcaption>An early design mockup of the Paintwall canvas and login flow.</figcaption>
        </figure>
      </section>

      <section id="features-section" className="panel">
        <h2>Key Features</h2>
        <ul>
          <li>Real-time collaborative canvas &mdash; watch other users' strokes appear live as they paint, with no refresh needed</li>
          <li>Full attribution &mdash; click any painted pixel to see exactly who drew it and when</li>
          <li>Zero-friction identity &mdash; jump in with just a username; add a password only if you want to protect it from being used by others</li>
          <li>Color palette suggestions &mdash; pull complementary color schemes from a third-party color API while you paint</li>
          <li>Permanent canvas &mdash; unlike time-limited events, the wall persists between sessions instead of resetting</li>
        </ul>
      </section>

      <section id="tech-section" className="panel">
        <h2>Technologies</h2>
        <dl>
          <dt>HTML</dt>
          <dd>Semantic page structure for the wall, login, and leaderboard views.</dd>

          <dt>CSS</dt>
          <dd>Styling for the drawing tools and a responsive layout for mobile and desktop.</dd>

          <dt>React</dt>
          <dd>Component-based views that route between logged-out and logged-in states without a page reload.</dd>

          <dt>Service</dt>
          <dd>A backend with endpoints for login/register, canvas state, pixel ownership, and color suggestions.</dd>

          <dt>DB</dt>
          <dd>Stores pixel ownership, user accounts, and session tokens.</dd>

          <dt>WebSocket</dt>
          <dd>Streams live strokes and viewer counts to every connected browser.</dd>
        </dl>
      </section>
    </main>

  );
}
import React, { useState, useEffect } from 'react';
import { AvatarIcon } from '../canvas/AvatarIcon';
import { getLeaderboard, subscribe } from '../canvas/canvasApi';
import { getLevel } from '../canvas/xp';

export function Artists() {
  const [leaderboard, setLeaderboard] = useState(() => getLeaderboard());

  // Re-reads the whole (small, bounded-by-MAX_XP_TRACKED_USERS) leaderboard
  // on every stroke, rather than trying to incrementally patch it client
  // side -- unlike the wall's pixel grid, this is at most a few dozen
  // entries, so a full re-fetch is cheap and avoids having to duplicate
  // canvasApi's own xp/sort logic here. This is also what makes a user's
  // own name start showing up here live as they paint, without needing to
  // revisit this page.
  useEffect(() => {
    const unsubscribe = subscribe((event) => {
      if (event.type !== 'stroke') {
        return;
      }
      setLeaderboard(getLeaderboard());
    });
    return unsubscribe;
  }, []);

  return (
    <>
      {/* Database data placeholder */}
      <section id="leaderboard-section" className="panel">
        <h2>Top Artists</h2>
        <p>Rankings are pulled from the pixels stored in the database, ordered by XP.</p>

        <div className="table-scroll">
          <table id="leaderboard">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Avatar</th>
                <th scope="col">Username</th>
                <th scope="col">Level</th>
                <th scope="col">XP</th>
                <th scope="col">Last Active</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 ? (
                <tr>
                  <td colSpan={6}>Nobody's painted anything yet -- be the first!</td>
                </tr>
              ) : (
                leaderboard.map(({ username, xp, lastActive }, index) => (
                  <tr key={username}>
                    <td>{index + 1}</td>
                    <td>
                      {/* avatarVersion is static here (unlike the header's) -- these rows don't
                          need live updates if someone's avatar changes while this page is open,
                          and remounting the page (e.g. navigating back to it) re-reads fresh anyway. */}
                      <AvatarIcon username={username} avatarVersion={0} size={24} />
                    </td>
                    <td>{username}</td>
                    <td>{getLevel(xp)}</td>
                    <td>{xp.toLocaleString()}</td>
                    <td>{lastActive ? new Date(lastActive).toLocaleDateString() : '--'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

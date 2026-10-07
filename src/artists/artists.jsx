import React from 'react';

export function Artists() {
  return (
    <>
      {/* Database data placeholder */}
      <section id="leaderboard-section" className="panel">
        <h2>Top Artists</h2>
        <p>Rankings are pulled from the pixels stored in the database, ordered by pixel count.</p>

        <div className="table-scroll">
          <table id="leaderboard">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Avatar</th>
                <th scope="col">Username</th>
                <th scope="col">Pixels Painted</th>
                <th scope="col">Last Active</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td><img src="images/placeholder.png" alt="CalebD avatar" width="32" height="32" /></td>
                <td>CalebD</td>
                <td>4,281</td>
                <td>2026-09-16</td>
              </tr>
              <tr>
                <td>2</td>
                <td><img src="images/placeholder.png" alt="Sarah avatar" width="32" height="32" /></td>
                <td>Sarah</td>
                <td>3,904</td>
                <td>2026-09-15</td>
              </tr>
              <tr>
                <td>3</td>
                <td><img src="images/placeholder.png" alt="anon_guest avatar" width="32" height="32" /></td>
                <td>anon_guest</td>
                <td>1,220</td>
                <td>2026-09-14</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
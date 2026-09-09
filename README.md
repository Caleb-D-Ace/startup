# Paintwall (Co-op Grafitti Canvas)

[My Notes](notes.md)

Paintwall is a public shared canvas with digital paint tools. Users can "log in" by providing a name. Once logged in, they can add their own strokes to the canvas. Each pixel is stored on the backend and is associated with the painter's username, allowing anyone who clicks on that section to view who painted it. 

> [!NOTE]
> This is a template for your startup application. You must modify this `README.md` file for each phase of your development. You only need to fill in the section for each deliverable when that deliverable is submitted in Canvas. Without completing the section for a deliverable, the TA will not know what to look for when grading your submission. Feel free to add additional information to each deliverable description, but make sure you at least have the list of rubric items and a description of what you did for each item.

> [!NOTE]
> If you are not familiar with Markdown then you should review the [documentation](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax) before continuing.

### Elevator pitch

Shared digital canvases such as r/place have become massive community events, but they are time-limited by nature. What if there was a public canvas that simply... stayed? Paintwall is a public digital graffiti wall where every pixel remembers who drew it. Featuring digital paint tools, a real-time shared canvas, and individual attribution for every drawing, Paintwall is a fun and creative application that showcases the power of WebSocket and individual artists.

### Design

![Design image](images/app_mockup.png)

This sequence diagram shows how user Caleb can log in and paint a stroke, while user Sarah can view the canvas, which dynamically updates as user Caleb paints.

```mermaid
sequenceDiagram
    actor A as Caleb (browser)
    actor B as Sarah (browser)
    participant S as Server

    A->>S: POST /api/auth (username, password)
    S-->>A: userId, token
    A->>S: WS connect (token)
    B->>S: WS connect (viewing only)
    S-->>B: GET /api/canvas (initial state)

    Note over A,S: Caleb paints a stroke
    A->>S: WS stroke:progress (points, color)
    S-->>B: broadcast stroke:progress
    A->>S: WS stroke:commit
    S->>S: rasterize points, save pixels
    S-->>B: broadcast stroke:commit

    Note over B,S: Sarah inspects a pixel
    B->>S: GET /api/pixel/x/y
    S-->>B: username, timestamp
```

### Key features

- Real-time collaborative canvas — watch other users' strokes appear live as they paint, with no refresh needed
- Full attribution — click any painted pixel to see exactly who drew it and when
- Zero-friction identity — jump in with just a username; add a password only if you want to protect it from being used by others
- Color palette suggestions — pull complementary color schemes from a third-party color API while you paint
- Permanent canvas — unlike time-limited events, the wall persists between sessions instead of resetting

### Technologies

I am going to use the required technologies in the following ways.

- **HTML** - One properly-structured HTML page (index.html) serving as the mount point for the React app. Uses semantic elements (`<header>`, `<main>`, `<canvas>`, etc.) for the app shell.
- **CSS** - Application uses CSS to provide website styling and drawing components (this may require more JavaScript than CSS; unsure right now) and to ensure the website looks good on mobile (vertical AND horizontal) and PC.
- **React** - Component-based views for logged-out (canvas + click-to-inspect ownership) and logged-in (adds drawing toolbar) states. Routes between these based on auth state — no page reload. Handles login, artist ownership display, and backend endpoint calls.
- **Service** - Backend service with endpoints for:
  - Combined register/login and logout for users (this application can collate the login and register functions into one, since it won't store any PII and doesn't require great security)
  - Color palette recommendations provided by the API at https://www.thecolorapi.com/
  - Getting the current canvas state for initial page load
  - Getting the username of whoever painted a selected pixel
- **DB** - Stores pixel ownership (x, y, color, user_id), user accounts (username, optional password hash), and session/auth tokens.
- **WebSocket** - Submits a finished or partially-finished stroke from the user to the backend, renders other users' strokes live without polling or refreshing, and broadcasts a live user count.

## 🚀 Specification Deliverable

> [!NOTE]
> Fill in this sections as the submission artifact for this deliverable. You can refer to this [example](https://github.com/webprogramming260/startup-example/blob/main/README.md) for inspiration.

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Git commit requirement)
- [x] Proper use of Markdown
- [x] A concise and compelling elevator pitch
- [x] Description of key features
- [x] Description of how you will use each technology including your 3rd party API and use of WebSocket
- [x] One or more rough sketches of your application. Images must be embedded in this file using Markdown image references.

## 🚀 AWS deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] **Rented EC2 server** - I did not complete this part of the deliverable.
- [ ] **Leased domain name** - I did not complete this part of the deliverable.
- [ ] **Server accessible** from my domain: [https://yourdomainnamehere.click](https://yourdomainnamehere.click) - I did not complete this part of the deliverable.

## 🚀 HTML deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **HTML pages** - I did not complete this part of the deliverable.
- [ ] **Proper HTML element usage** - I did not complete this part of the deliverable.
- [ ] **Links** - I did not complete this part of the deliverable.
- [ ] **Text** - I did not complete this part of the deliverable.
- [ ] **3rd party API placeholder** - I did not complete this part of the deliverable.
- [ ] **Images** - I did not complete this part of the deliverable.
- [ ] **Login placeholder** - I did not complete this part of the deliverable.
- [ ] **DB data placeholder** - I did not complete this part of the deliverable.
- [ ] **WebSocket placeholder** - I did not complete this part of the deliverable.

## 🚀 CSS deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **Visually appealing colors and layout. No overflowing elements.** - I did not complete this part of the deliverable.
- [ ] **Use of a CSS framework** - I did not complete this part of the deliverable.
- [ ] **All visual elements styled using CSS** - I did not complete this part of the deliverable.
- [ ] **Responsive to window resizing using flexbox and/or grid display** - I did not complete this part of the deliverable.
- [ ] **Use of a imported font** - I did not complete this part of the deliverable.
- [ ] **Use of different types of selectors including element, class, ID, and pseudo selectors** - I did not complete this part of the deliverable.

## 🚀 React part 1: Routing deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **Bundled using Vite** - I did not complete this part of the deliverable.
- [ ] **Components** - I did not complete this part of the deliverable.
- [ ] **Router** - I did not complete this part of the deliverable.

## 🚀 React part 2: Reactivity deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **All functionality implemented or mocked out** - I did not complete this part of the deliverable.
- [ ] **Hooks** - I did not complete this part of the deliverable.

## 🚀 Service deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **Node.js/Express HTTP service** - I did not complete this part of the deliverable.
- [ ] **Static middleware for frontend** - I did not complete this part of the deliverable.
- [ ] **Calls to third party endpoints** - I did not complete this part of the deliverable.
- [ ] **Backend service endpoints** - I did not complete this part of the deliverable.
- [ ] **Frontend calls service endpoints** - I did not complete this part of the deliverable.
- [ ] **Supports registration, login, logout, and restricted endpoint** - I did not complete this part of the deliverable.
- [ ] **Uses BCrypt to hash passwords** - I did not complete this part of the deliverable.

## 🚀 DB deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **Stores data in MongoDB** - I did not complete this part of the deliverable.
- [ ] **Stores credentials in MongoDB** - I did not complete this part of the deliverable.

## 🚀 WebSocket deliverable

For this deliverable I did the following. I checked the box `[x]` and added a description for things I completed.

- [ ] I completed the prerequisites for this deliverable (Simon deployed, GitHub link, Git commits)
- [ ] **Backend listens for WebSocket connection** - I did not complete this part of the deliverable.
- [ ] **Frontend makes WebSocket connection** - I did not complete this part of the deliverable.
- [ ] **Data sent over WebSocket connection** - I did not complete this part of the deliverable.
- [ ] **WebSocket data displayed** - I did not complete this part of the deliverable.
- [ ] **Application is fully functional** - I did not complete this part of the deliverable.
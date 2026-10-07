function initAuth() {
  const authForm = document.getElementById("auth-form");
  const registerHint = document.getElementById("register-hint");
  const profilePanel = document.getElementById("profile-panel");
  const usernameInput = document.getElementById("username");
  const currentUsernameSpan = document.getElementById("current-username");
  const logoutBtn = document.getElementById("logout-btn");

  if (!authForm || !profilePanel) {
    return;
  }

  function showLoggedIn(username) {
    currentUsernameSpan.textContent = username;
    authForm.hidden = true;
    registerHint.hidden = true;
    profilePanel.hidden = false;
  }

  function showLoggedOut() {
    authForm.hidden = false;
    registerHint.hidden = false;
    profilePanel.hidden = true;
    authForm.reset();
  }

  const savedUsername = localStorage.getItem("paintwall-username");
  if (savedUsername) {
    showLoggedIn(savedUsername);
  } else {
    showLoggedOut();
  }

  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = usernameInput.value.trim();
    if (!username) {
      return;
    }
    localStorage.setItem("paintwall-username", username);
    showLoggedIn(username);
  });

  logoutBtn.addEventListener("click", () => {
    localStorage.removeItem("paintwall-username");
    showLoggedOut();
  });
}

document.addEventListener("DOMContentLoaded", initAuth);

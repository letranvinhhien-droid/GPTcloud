// Keep the entry small so the HTML loading screen can paint while the app,
// styles, and fonts download. Loading CSS through this dynamic import also
// avoids a render-blocking app stylesheet in the initial HTML document.
import("./bootstrap.jsx").catch(() => {
  const screen = document.querySelector(".startup-screen");
  const message = document.getElementById("startup-message");
  const retry = document.getElementById("startup-retry");
  if (message) message.textContent = "We couldn’t open Meridian.";
  screen?.querySelector(".startup-spinner")?.setAttribute("hidden", "");
  if (retry) {
    retry.hidden = false;
    retry.addEventListener("click", () => window.location.reload(), {
      once: true,
    });
  }
});

import "./speech-confirm-page.css";

const original = document.querySelector("#original");
const corrected = document.querySelector("#corrected");
window.desktopSpeechConfirm.onData((review) => {
  original.textContent = review.originalText || "";
  corrected.textContent = review.correctedText || "";
});
document.querySelector("#accept").addEventListener("click", () => window.desktopSpeechConfirm.respond("corrected"));
document.querySelector("#use-original").addEventListener("click", () => window.desktopSpeechConfirm.respond("original"));
document.querySelector("#retry").addEventListener("click", () => window.desktopSpeechConfirm.respond(null));
document.querySelector("#close").addEventListener("click", () => window.desktopSpeechConfirm.respond(null));

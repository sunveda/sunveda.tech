// Daiboju pages on sunveda.tech call the Daiboju service on Google Cloud Run (source: github.com/sunveda/daiboju).
// Synced from sunveda/daiboju public/ — edit there, then copy every file except this one.
// Set this to the Cloud Run URL printed by scripts/deploy-cloudrun.sh (e.g. https://daiboju-xxxxx-an.a.run.app).
// While it is empty the pages show their "unavailable" fallbacks and send nothing.
window.DAIBOJU_API = '';

// Launch gate: real sign-ups stay closed until privacy.html covers Daiboju's alert contacts.
// Flip to true in the same PR that ships that privacy update. (The layout tests open it to audit the form.)
if (window.DAIBOJU_SIGNUP_OPEN === undefined) window.DAIBOJU_SIGNUP_OPEN = false;

// Daiboju pages on sunveda.tech call the Daiboju service on Google Cloud Run (source: github.com/sunveda/daiboju).
// Synced from sunveda/daiboju public/ — edit there, then copy every file except this one.
// Set this to the Cloud Run URL printed by scripts/deploy-cloudrun.sh (e.g. https://daiboju-xxxxx-an.a.run.app).
// Deployed 2026-11-12 to project daiboju (asia-northeast1).
window.DAIBOJU_API = 'https://daiboju-668725030350.asia-northeast1.run.app';

// Launch gate: open since privacy.html covers Daiboju's alert contacts (2026-11-12).
// The service enforces its own gate too: real sign-ups also need SIGNUP_OPEN=1 on Cloud Run.
if (window.DAIBOJU_SIGNUP_OPEN === undefined) window.DAIBOJU_SIGNUP_OPEN = true;

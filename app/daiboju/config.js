// Daiboju pages on sunveda.tech call the Daiboju API on Vercel (source: github.com/sunveda/daiboju).
// Synced from sunveda/daiboju public/ — edit there, then copy every file except this one.
window.DAIBOJU_API = 'https://daiboju.vercel.app';

// Launch gate: real sign-ups stay closed until privacy.html covers Daiboju's alert contacts.
// Flip to true in the same PR that ships that privacy update. (The layout tests open it to audit the form.)
if (window.DAIBOJU_SIGNUP_OPEN === undefined) window.DAIBOJU_SIGNUP_OPEN = false;

export const DEFAULT_EVENT = "sanya-2nd-birthday-2026";
export const RATINGS = [
  { value: "loved-it", label: "Loved it", symbol: "♡" },
  { value: "okay", label: "It was okay", symbol: "◡" },
  { value: "could-be-better", label: "Could be better", symbol: "↗" },
];
export const EVENTS = {
  [DEFAULT_EVENT]: {
    id: DEFAULT_EVENT,
    version: 1,
    title: "Sanya’s 2nd birthday",
    eyebrow: "A little celebration. A lot of memories.",
    intro:
      "Thank you for celebrating with us. Tell us what made you smile—and what we can do better next time.",
    date: "12 September 2026",
    accepting: true,
    questions: [
      {
        id: "overall",
        type: "rating",
        title: "How was your overall experience?",
        required: true,
        comment: true,
      },
      { id: "food", type: "rating", title: "How was the food?", comment: true },
      {
        id: "favoriteFood",
        type: "choice",
        title: "Which food did you like most?",
        options: ["Pav bhaji", "Pizza", "Biryani"],
      },
      {
        id: "decoration",
        type: "rating",
        title: "How were the decorations?",
        comment: true,
      },
      {
        id: "cake",
        type: "rating",
        title: "How was the eggless cake?",
        comment: true,
      },
      { id: "likedMost", type: "text", title: "What did you like most?" },
      {
        id: "improve",
        type: "text",
        title: "What could we improve?",
        hint: "Anything you didn’t enjoy? We appreciate honest feedback.",
      },
      {
        id: "biryani",
        type: "text",
        title: "Let’s talk biryani",
        hint: "The taste, spice, aroma, or texture—tell us what you thought.",
        video: true,
      },
    ],
  },
};
export const VIDEO = {
  maxBytes: 250_000_000,
  maxSeconds: 480,
  chunkBytes: 5 * 1024 * 1024,
  types: ["video/mp4", "video/quicktime"],
};

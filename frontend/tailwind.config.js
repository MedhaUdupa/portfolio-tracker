/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101418",
        panel: "#1A2026",
        line: "#2A323B",
        mist: "#8B98A5",
        paper: "#E8EDF2",
        mint: "#4FD1A5",
        coral: "#F27E7E",
        gold: "#E3B455",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

/** @type {import('tailwindcss').Config} */
// Tailwind setup: dark mode toggled via the `class` on <html>
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

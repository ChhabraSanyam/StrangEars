/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html", 
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/**/*.css" // Include CSS files for @apply directive scanning
  ],
  theme: {
    extend: {
      // Custom font families - all actively used
      fontFamily: {
        jomhuria: ["Jomhuria", "serif"],
        "young-serif": ["Young Serif", "serif"],
        prata: ["Prata", "serif"],
        ysabeau: ["Ysabeau", "sans-serif"],
        inter: ["Inter", "sans-serif"],
      },
      // Optimized color palette - only used colors
      colors: {
        sage: "#e4eae3",
        charcoal: "#36454f",
        "slate-dark": "#2d3748",
        "slate-medium": "#4a5568",
        "sage-dark": "#4a5d4a", // Used in CSS components
        "sage-darker": "#3a4d3a", // Used in CSS components
        "gray-light": "#9ca3af",
        "gray-border": "#a0aec0",
        "gray-placeholder": "#718096",
        "purple-photo": "#b794f6",
        "purple-photo-hover": "#9f7aea",
      },
      // Optimized animations - only used animations
      animation: {
        "bounce-slow": "bounce 2s infinite",
        "fade-in-up-delayed": "fadeInUpDelayed 0.6s ease-out forwards",
      },
      // Optimized keyframes - only used keyframes
      keyframes: {
        fadeInUpDelayed: {
          "0%": {
            opacity: "0",
            transform: "translateX(-50%) translateY(30px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateX(-50%) translateY(0)",
          },
        },
        bounce: {
          "0%, 20%, 50%, 80%, 100%": {
            transform: "translateY(0)",
          },
          "40%": {
            transform: "translateY(-10px)",
          },
          "60%": {
            transform: "translateY(-5px)",
          },
        },
      },
      // Custom responsive breakpoints
      screens: {
        xs: "480px",
      },
      // Optimized width values - only used widths
      width: {
        45: "11.25rem", // 180px - button width
        75: "18.75rem", // 300px - expanded button width  
        40: "10rem", // 160px - tablet button width
      },
      // Optimized transform values
      scale: {
        85: "0.85",
      },
      // Optimized z-index values - only used z-indexes
      zIndex: {
        1: "1",
        2: "2",
        3: "3",
        10: "10",
      },
      // Optimized opacity values - only used opacities
      opacity: {
        15: "0.15",
        12: "0.12",
        "08": "0.08",
      },
      // Optimized transition timing functions - only used functions
      transitionTimingFunction: {
        hero: "cubic-bezier(0.4, 0, 0.2, 1)",
        smooth: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
      },
      // Optimized transition durations - only used durations
      transitionDuration: {
        800: "800ms",
        1200: "1200ms",
      },
    },
  },
  // Production optimizations
  corePlugins: {
    // Disable unused core plugins for smaller bundle
    container: false,
  },
  plugins: [],
};

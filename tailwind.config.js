/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter var', 'sans-serif'],
      },
      colors: {
        primary: {
          50: '#e9eef9',
          100: '#c8d3ef',
          200: '#a4b7e4',
          300: '#7f9ad8',
          400: '#5f82cd',
          500: '#0a2767', // primary
          600: '#09235d',
          700: '#081e50',
          800: '#061943',
          900: '#041233',
          950: '#030d26',
        },
        secondary: {
          50: '#e9eef9',
          100: '#c8d3ef',
          200: '#a4b7e4',
          300: '#7f9ad8',
          400: '#5f82cd',
          500: '#0a2767', // secondary
          600: '#09235d',
          700: '#081e50',
          800: '#061943',
          900: '#041233',
          950: '#030d26',
        },
        accent: {
          50: '#e9eef9',
          100: '#c8d3ef',
          200: '#a4b7e4',
          300: '#7f9ad8',
          400: '#5f82cd',
          500: '#0a2767', // accent
          600: '#09235d',
          700: '#081e50',
          800: '#061943',
          900: '#041233',
          950: '#030d26',
        },
        success: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
          800: '#166534',
          900: '#14532D',
          950: '#052E16',
        },
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
          950: '#451A03',
        },
        error: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
          950: '#450A0A',
        },
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-in-out',
        'slide-in': 'slide-in 0.3s ease-out',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-in': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      screens: {
        'xs': '414px', // custom for iPhone 11 and up
        'sm': '640px',
        'md': '768px',
        'lg': '1024px',
        // ...other breakpoints
      },
    },
  },
  plugins: [],
};
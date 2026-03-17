/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Legacy aliases (backward compat)
        primary: {
          DEFAULT: '#0c0f14',
          light: '#2d3748',
          dark: '#000000',
        },
        // Figma design tokens
        surface: {
          widget: '#ffffff',
          primary: '#0c0f14',
          'default-2x-light': '#f1f1f1',
          'default-x-light': '#dedede',
          input: '#ffffff',
          'toggle-bg': '#f1f1f1',
          'toggle-selected': '#ffffff',
          'error-faint': 'rgba(239,68,68,0.08)',
          'error-dark': '#a91c1c',
          'success-faint': 'rgba(34,197,94,0.08)',
          'info-faint': 'rgba(59,130,246,0.08)',
          'neutral-faint': 'rgba(12,15,20,0.04)',
        },
        text: {
          heading: '#0c0f14',
          body: '#0c0f14',
          caption: '#696a70',
          'on-primary': '#f1f1f1',
          'input-label': '#696a70',
          'error-default': '#7f1d1d',
          'success-default': '#14532b',
          'info-default': '#1e478a',
          'avatar': '#696a70',
        },
        border: {
          'x-light': '#dedede',
          'input': '#cacaca',
          'secondary': '#cacaca',
          '4x-light': '#f9f9f9',
        },
        // Semantic colors
        error: { DEFAULT: '#ef4444', dark: '#a91c1c', faint: 'rgba(239,68,68,0.08)' },
        success: { DEFAULT: '#22c55e', dark: '#14532b', faint: 'rgba(34,197,94,0.08)' },
        warning: { DEFAULT: '#f59e0b' },
        info: { DEFAULT: '#3b82f6', dark: '#1e478a', faint: 'rgba(59,130,246,0.08)' },
      },
      fontFamily: {
        sans: ['var(--font-nunito-sans)', 'Nunito Sans', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'pill': '80px',
        '2xs': '4px',
      },
      boxShadow: {
        'elevation-1': '0px 1px 4px 0px rgba(12,15,20,0.08)',
      },
    },
  },
  plugins: [],
}

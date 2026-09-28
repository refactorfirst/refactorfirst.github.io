// Dark mode toggle for the top menu bar: three radio modes (light, dark,
// system) rendered as icon pills. Deliberately a Server Component with no
// state and no handlers — the radios ARE the state, and app/globals.css
// selects the palette via :has(#rf-theme-…:checked) plus
// prefers-color-scheme, so switching themes is pure CSS. A tiny inline
// bootstrap script in app/layout.jsx (progressive enhancement) restores and
// persists the checked radio across hard page loads.
const MODES = [
  {
    value: 'light',
    label: 'Light theme',
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    )
  },
  {
    value: 'dark',
    label: 'Dark theme',
    icon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  },
  {
    value: 'system',
    label: 'System preference',
    icon: (
      <>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </>
    )
  }
];

/**
 * Renders the three-mode color theme radio group pinned to the menu bar's
 * right edge (last flex child of .menu-bar, mirroring the breadcrumbs'
 * left-edge alignment with the menu).
 *
 * @returns {import('react').ReactElement} The theme toggle radiogroup.
 */
export default function ThemeToggle() {
  return (
    <div className="theme-toggle" role="radiogroup" aria-label="Color theme">
      {MODES.map(mode => (
        <label key={mode.value} className="theme-option">
          <input
            type="radio"
            name="rf-theme"
            id={`rf-theme-${mode.value}`}
            value={mode.value}
            aria-label={mode.label}
            className="theme-option-input"
            defaultChecked={mode.value === 'system'}
          />
          <svg
            className="theme-option-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {mode.icon}
          </svg>
        </label>
      ))}
    </div>
  );
}

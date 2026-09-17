'use client';

import { useState } from 'react';

// Hamburger toggle for the main navigation (small viewports). Mirrors the
// legacy js/main.js behavior: toggles the `open` class on #menu-links and
// keeps aria-expanded in sync.
export default function MenuToggle() {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    const links = document.getElementById('menu-links');
    const next = !expanded;
    setExpanded(next);
    if (links) links.classList.toggle('open', next);
  };

  return (
    <button
      id="menu-toggle"
      className="menu-toggle"
      aria-label="Toggle navigation menu"
      aria-expanded={expanded}
      aria-controls="menu-links"
      onClick={toggle}
    >
      &#9776;
    </button>
  );
}

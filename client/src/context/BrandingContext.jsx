import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiBase } from '../lib/api';

const BrandingContext = createContext(null);

const DEFAULTS = {
  site_name:           'Esports Standings',
  site_tagline:        'Local Circuit',
  site_logo:           null,
  site_favicon:        null,
  hero_banner:         null,
  primary_color:       '#7c6fff',
  accent_color:        '#7c6fff',
  footer_links:        [],
  social_links:        [],
  announcement_text:   '',
  announcement_active: false,
};

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function applyBrandingVars(branding) {
  const root = document.documentElement;

  if (branding.accent_color) {
    root.style.setProperty('--accent', branding.accent_color);
    try {
      root.style.setProperty('--accent-glow', hexToRgba(branding.accent_color, 0.18));
    } catch (_) {}
  }

  if (branding.primary_color) {
    root.style.setProperty('--primary', branding.primary_color);
  }

  if (branding.site_favicon) {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = `${apiBase}${branding.site_favicon}`;
  }
}

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULTS);

  const reloadBranding = useCallback(() => {
    fetch(`${apiBase}/api/settings/public`)
      .then((r) => r.json())
      .then((data) => {
        const merged = { ...DEFAULTS, ...data };
        setBranding(merged);
        applyBrandingVars(merged);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    reloadBranding();
  }, [reloadBranding]);

  return (
    <BrandingContext.Provider value={{ branding, reloadBranding }}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  return ctx ?? { branding: DEFAULTS, reloadBranding: () => {} };
}

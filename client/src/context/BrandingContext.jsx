import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { resolveImageUrl } from '../utils/images';
import { hexToRgba } from '../utils/colors';
import { publicApi } from '../api';

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
  stream_url:          null,
  stream_active:       false,
};

/** Push the active branding values into CSS custom properties + favicon link. */
function applyBrandingVars(branding) {
  const root = document.documentElement;

  if (branding.accent_color) {
    root.style.setProperty('--accent', branding.accent_color);
    try {
      root.style.setProperty('--accent-glow', hexToRgba(branding.accent_color, 0.18));
    } catch (_) { /* malformed hex — ignore */ }
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
    link.href = resolveImageUrl(branding.site_favicon);
  }
}

export function BrandingProvider({ children }) {
  const [branding, setBranding] = useState(DEFAULTS);

  const reloadBranding = useCallback(async () => {
    try {
      const data = await publicApi.getSettings();
      if (!data || typeof data !== 'object') return;
      // Defensive: ensure arrays are arrays
      const safe = {
        ...data,
        footer_links: Array.isArray(data.footer_links) ? data.footer_links : [],
        social_links: Array.isArray(data.social_links) ? data.social_links : [],
      };
      const merged = { ...DEFAULTS, ...safe };
      setBranding(merged);
      applyBrandingVars(merged);
    } catch (_) {
      // Network error — keep defaults
    }
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

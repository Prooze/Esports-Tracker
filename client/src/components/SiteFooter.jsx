import { useBranding } from '../context/BrandingContext';
import { SocialIcon, SOCIAL_PLATFORMS } from './SocialIcon';

/** Footer rendered at the bottom of every page; hidden when no content set. */
export default function SiteFooter() {
  const { branding } = useBranding();
  const footerItems = Array.isArray(branding.footer_links) ? branding.footer_links : [];
  const socialLinks = Array.isArray(branding.social_links) ? branding.social_links : [];

  const hasFooterContent =
    footerItems.some((item) =>
      (item.type === 'text' && item.content) ||
      ((item.type === 'link' || !item.type) && item.label && item.url)
    ) || socialLinks.some((l) => l.url);
  if (!hasFooterContent) return null;

  return (
    <footer className="site-footer">
      {footerItems.length > 0 && (
        <nav className="footer-links" aria-label="Footer">
          {footerItems.map((item, i) => {
            if (item.type === 'text') {
              return item.content
                ? <span key={i} className="footer-text">{item.content}</span>
                : null;
            }
            return item.label && item.url
              ? (
                <a
                  key={i}
                  href={item.url}
                  className="footer-link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {item.label}
                </a>
              )
              : null;
          })}
        </nav>
      )}
      {socialLinks.some((l) => l.url) && (
        <div className="social-links">
          {socialLinks.map((link, i) => {
            const platform = SOCIAL_PLATFORMS.find((p) => p.key === link.platform);
            if (!platform || !link.url) return null;
            return (
              <a
                key={i}
                href={link.url}
                className="social-link"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={platform.label}
                title={platform.label}
              >
                <SocialIcon platform={link.platform} size={20} />
              </a>
            );
          })}
        </div>
      )}
    </footer>
  );
}

/**
 * Detect a streaming platform from a URL. Returns null for unsupported hosts.
 * @param {string} url
 * @returns {'twitch'|'youtube'|'facebook'|null}
 */
export function detectPlatform(url) {
  if (!url) return null;
  if (/twitch\.tv\//i.test(url)) return 'twitch';
  if (/youtube\.com\/|youtu\.be\//i.test(url)) return 'youtube';
  if (/facebook\.com\/|fb\.watch\//i.test(url)) return 'facebook';
  return null;
}

/**
 * Build an embeddable iframe URL for a given live stream.
 * Twitch needs the parent domain to allow framing.
 */
export function getEmbedUrl(url, platform) {
  if (platform === 'twitch') {
    const m = url.match(/twitch\.tv\/([^/?#]+)/i);
    const channel = m ? m[1] : '';
    const domain = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
    return `https://player.twitch.tv/?channel=${channel}&parent=${domain}`;
  }
  if (platform === 'youtube') {
    const m1 = url.match(/[?&]v=([^&]+)/);
    const m2 = url.match(/youtu\.be\/([^/?#]+)/);
    const videoId = m1 ? m1[1] : m2 ? m2[1] : '';
    return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  }
  if (platform === 'facebook') {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`;
  }
  return null;
}

/**
 * For a recording URL, derive a thumbnail and platform tag if recognised.
 * Only YouTube exposes a public thumbnail endpoint; Facebook returns null
 * and the UI falls back to a play-icon placeholder.
 */
export function getRecordingInfo(url) {
  if (!url) return null;
  const ytMatch = url.match(/(?:[?&]v=|youtu\.be\/)([^&/?#]+)/);
  if (ytMatch) {
    return {
      platform: 'youtube',
      thumbnail: `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`,
    };
  }
  if (/facebook\.com\/|fb\.watch\//i.test(url)) {
    return { platform: 'facebook', thumbnail: null };
  }
  return null;
}

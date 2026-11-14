// Images that lived inside Claude Design are referenced as /_blob/<id> in the screens.
// They map to files in public/images. Until a real file is added, a placeholder is shown.
const ASSETS = {
  '/_blob/d18d465b4769a29a78cdbd57de8676e7': {
    src: '/images/iitr-logo.png',
    placeholder: '/images/iitr-logo-placeholder.svg'
  },
  '/_blob/d380e2b78f28a976382d51f88b9181ac': {
    src: '/images/profile-photo.webp',
    placeholder: '/images/profile-photo-placeholder.svg'
  }
};

export function assetFor(src) {
  return ASSETS[src] || null;
}

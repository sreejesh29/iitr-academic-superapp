import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getScreen, hasScreen } from './runtime/dc.js';
import manifest from './screens/screens.json';

// Load every screen so <dc-import> can find its children.
import.meta.glob('./screens/*.dc.html', { eager: true });

const SCREEN_W = 390;
const SCREEN_H = 844;
const STATUS_H = 54;

// Extra props for screens opened directly. Mark attendance has a built-in simulation
// (the professor opens the portal a few seconds after you pick the class) that is off by default.
const SCREEN_PROPS = { MarkAttendance: { auto: true } };

/* ---------- routing (#/ScreenName) ---------- */

function screenFromHash() {
  const name = decodeURIComponent(window.location.hash.replace(/^#\/?/, ''));
  return hasScreen(name) ? name : manifest.start;
}

// Links in the design point at files like "Timetable.dc.html" (or the phone-preview
// copies "TimetablePhone.dc.html"). Turn one into a screen name, or null.
function resolveHref(href) {
  const m = /([A-Za-z0-9_-]+)\.dc\.html$/.exec(href.split(/[?#]/)[0]);
  if (!m) return null;
  let name = m[1];
  if (!hasScreen(name) && name.endsWith('Phone')) name = name.slice(0, -5);
  return hasScreen(name) ? name : null;
}

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return vp;
}

class ScreenBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="screen-error">
          <strong>This screen couldn’t load.</strong>
          <a href={'#/' + manifest.home}>Go to Home</a>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------- the live screen ---------- */

function Device({ name, visit, onNavigate, framed, zoom }) {
  const scrollRef = useRef(null);
  const Screen = getScreen(name);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [name, visit]);

  const onClick = useCallback(
    (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented) return;
      const href = a.getAttribute('href');
      if (!href) return;
      if (href === '#') {
        e.preventDefault();
        return;
      }
      if (href.startsWith('#')) {
        e.preventDefault();
        const el = scrollRef.current && scrollRef.current.querySelector(href);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const target = resolveHref(href);
      if (target) {
        e.preventDefault();
        onNavigate(target);
      }
    },
    [onNavigate]
  );

  const viewport = (
    <div
      className="viewport"
      style={framed ? { width: SCREEN_W, height: SCREEN_H } : { width: SCREEN_W, height: `calc(100dvh / ${zoom})`, zoom }}
      onClick={onClick}
    >
      {framed && <div className="status-bar" aria-hidden="true" />}
      <div className="scroller" ref={scrollRef} style={framed ? { top: STATUS_H } : { top: 0 }}>
        <ScreenBoundary key={name + ':' + visit}>
          <Screen key={name + ':' + visit} {...(SCREEN_PROPS[name] || {})} />
        </ScreenBoundary>
      </div>
      {framed && <span className="island" aria-hidden="true" />}
      {framed && <span className="home-indicator" aria-hidden="true" />}
    </div>
  );

  if (!framed) return viewport;
  return (
    <div className="device">
      <span className="btn btn-1" aria-hidden="true" />
      <span className="btn btn-2" aria-hidden="true" />
      <span className="btn btn-3" aria-hidden="true" />
      {viewport}
    </div>
  );
}

/* ---------- app shell ---------- */

export default function App() {
  const [route, setRoute] = useState(() => ({ name: screenFromHash(), visit: 0 }));
  const vp = useViewport();

  useEffect(() => {
    const onHash = () => setRoute((r) => ({ name: screenFromHash(), visit: r.visit + 1 }));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const entry = manifest.order.find(([n]) => n === route.name);
    document.title = (entry ? entry[1] + ' · ' : '') + 'IITR Academic Super App';
  }, [route.name]);

  const navigate = useCallback((name) => {
    const hash = '#/' + name;
    if (window.location.hash === hash) setRoute((r) => ({ name, visit: r.visit + 1 }));
    else window.location.hash = hash; // hashchange updates the route, and Back works
  }, []);

  // Phones get the app full-screen; bigger screens get a device frame.
  const framed = vp.w >= 560;

  if (!framed) {
    return (
      <div className="app app-mobile">
        <Device name={route.name} visit={route.visit} onNavigate={navigate} framed={false} zoom={vp.w / SCREEN_W} />
      </div>
    );
  }

  const frameH = SCREEN_H + 24;
  const scale = Math.min(1, (vp.h - 40) / frameH);

  return (
    <div className="app app-desktop">
      <main className="stage">
        <div className="frame-scale" style={{ zoom: scale }}>
          <Device name={route.name} visit={route.visit} onNavigate={navigate} framed />
        </div>
      </main>
    </div>
  );
}

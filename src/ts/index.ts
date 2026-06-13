import { fetchTimelineAndPushPins } from './timeline';

declare const Pebble: {
  getTimelineToken?: (success: (token: string) => void, error: (err: unknown) => void) => void;
  getAccountToken: () => string;
  sendAppMessage: (msg: Record<string, number | string>, ok: () => void, fail: (e: { message: string }) => void) => void;
  openURL: (url: string) => void;
  addEventListener: (type: string, handler: (e: { payload?: Record<string, unknown> }) => void) => void;
};

const TRIG_MAX_ANGLE = 65536;
let geo_update_timer: ReturnType<typeof setInterval> | undefined;
let geo_pending = false;

const api_host = 'https://pebble-qibla-www-production.up.railway.app';

const LAST_FETCH_TIME_KEY = 'qibla_last_fetch_time';
const TIMELINE_TOKEN_KEY = 'qibla_timeline_token';
const GEO_POS_KEY = 'qibla_geo_pos';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Clear all data phone-side for this watch.
 */
const deleteAll = () => {
  localStorage.clear();
  console.log('Cleared localStorage');
};

function getLastFetchTime(): number | null {
  try {
    const s = localStorage.getItem(LAST_FETCH_TIME_KEY);
    return s != null ? parseInt(s, 10) : null;
  } catch (_) { }
  return null;
}

function setLastFetchTime(): void {
  try {
    localStorage.setItem(LAST_FETCH_TIME_KEY, String(Date.now()));
  } catch (_) { }
}

function setTimelineToken(token: string): void {
  try {
    localStorage.setItem(TIMELINE_TOKEN_KEY, token);
  } catch (_) { }
}

function getTimelineToken(): string | undefined {
  try {
    const s = localStorage.getItem(TIMELINE_TOKEN_KEY);
    return s != null ? s : undefined;
  } catch (_) { }
  return undefined;
}

function getGeoPos(): { coords: { latitude: number; longitude: number } } | undefined {
  try {
    const s = localStorage.getItem(GEO_POS_KEY);
    return s != null ? JSON.parse(s) : undefined;
  } catch (_) { }
  return undefined;
}

function setGeoPos(pos: { coords: { latitude: number; longitude: number } }): void {
  try {
    localStorage.setItem(GEO_POS_KEY, JSON.stringify(pos));
  } catch (_) { }
}

/** Call fetch only when app connects if last successful fetch was at least one day ago (or never). */
function fetchTimeline(): void {
  const timeline_token = getTimelineToken();
  if (!timeline_token) return;
  const last = getLastFetchTime();
  const now = Date.now();
  if (last != null && now - last < ONE_DAY_MS) {
    console.log('Skipping fetch - last success was less than one day ago');
    return;
  }
  fetchTimelineAndPushPins(api_host, Pebble.getAccountToken(), timeline_token, setLastFetchTime);
}

/** Daily wakeup: always fetch (bypasses one-day throttle). */
function fetchTimelineFromWakeup(): void {
  const timeline_token = getTimelineToken();
  if (!timeline_token) {
    console.log('Wakeup fetch skipped - no timeline token');
    return;
  }
  console.log('Timeline fetch from wakeup');
  fetchTimelineAndPushPins(api_host, Pebble.getAccountToken(), timeline_token, setLastFetchTime);
}

const am_send_ok = (): void => { };
const am_send_fail = (e: { message: string }): void => {
  console.log('AM send fail', e.message);
};

const geo_error = (err: { code: number; message: string }): void => {
  console.log('Geo fail', err.code, err.message);
  geo_pending = false;
};

function timeline_subscribe(): void {
  console.log('Timeline subscribe', getGeoPos(), getTimelineToken());
  const geo_pos = getGeoPos();
  const timeline_token = getTimelineToken();
  if (!geo_pos || !timeline_token) {
    return;
  }
  const req = new XMLHttpRequest();
  req.open('POST', api_host + '/subscribe', true);
  req.onload = () => {
    if (req.readyState === 4) {
      if (req.status === 200) {
        const response = JSON.parse(req.responseText);
        const loc = response.location_geoname;
        if (loc) {
          Pebble.sendAppMessage({ AM_GEO_NAME: loc }, am_send_ok, am_send_fail);
        }
      } else {
        console.error('Error subscribing to timeline ' + req.responseText);
      }
    }
  };
  req.setRequestHeader('Content-type', 'application/json');
  req.send(
    JSON.stringify({
      location_lat: geo_pos!.coords.latitude,
      location_lon: geo_pos!.coords.longitude,
      tz_offset: new Date().getTimezoneOffset(),
      user_token: Pebble.getAccountToken(),
      timeline_token: timeline_token,
    })
  );
}

function push_geo_keys(pos: { coords: { latitude: number; longitude: number } }): void {
  console.log('Geo request ok');
  geo_pending = false;
  setGeoPos(pos);
  Pebble.sendAppMessage(
    {
      AM_GEO_LAT: Math.round((pos.coords.latitude * TRIG_MAX_ANGLE) / 360),
      AM_GEO_LON: Math.round((pos.coords.longitude * TRIG_MAX_ANGLE) / 360),
      AM_GEO_NAME: '',
    },
    am_send_ok,
    am_send_fail
  );
}

function request_geo(): void {
  if (geo_pending) return;
  console.log('Geo request started');
  navigator.geolocation.getCurrentPosition(push_geo_keys, geo_error, {
    timeout: 15000,
    maximumAge: 60000,
  });
}

function app_startup(): void {
  // deleteAll();
  console.log('JS started');
  geo_update_timer = setInterval(request_geo, 1000);
  request_geo();
}

async function watchapp_alive(e: { payload?: Record<string, unknown> }): Promise<void> {
  console.log('Watchapp is alive');
  if (geo_update_timer) clearInterval(geo_update_timer);
  fetchTimeline();
  const dict = e.payload;
  try {
    if (dict) {
      console.log('dict', dict);
      if (dict['AM_CLEAR_CACHE']) await deleteAll();
      if (dict['AM_WAKEUP_FETCH']) fetchTimelineFromWakeup();
    }
  } catch (e) {
    console.log('Failed to handle message');
    console.log(e);
  }
  console.log('appmessage: ' + JSON.stringify(dict));
}

function show_config(): void {
  Pebble.openURL(api_host + '/settings/' + Pebble.getAccountToken());
}

Pebble.addEventListener('ready', app_startup);
Pebble.addEventListener('appmessage', watchapp_alive);
Pebble.addEventListener('showConfiguration', show_config);

if (Pebble.getTimelineToken) {
  console.log('Getting timeline token');
  Pebble.getTimelineToken(
    (token: string) => {
      setTimelineToken(token);
      console.log('Timeline token callback', getTimelineToken());
      timeline_subscribe();
      fetchTimeline();
    },
    (error: unknown) => {
      console.log('Error getting timeline token', error);
    }
  );
}

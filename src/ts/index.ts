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
let geo_pos: { coords: { latitude: number; longitude: number } } | undefined;
let timeline_token: string | undefined;
let did_subscribe = false;

const api_host = 'https://pebble-qibla-www-production.up.railway.app';

const am_send_ok = (): void => {};
const am_send_fail = (e: { message: string }): void => {
  console.log('AM send fail', e.message);
};

const geo_error = (err: { code: number; message: string }): void => {
  console.log('Geo fail', err.code, err.message);
  geo_pending = false;
};

function timeline_subscribe(): void {
  if (!geo_pos || (!timeline_token && Pebble.getTimelineToken)) {
    return;
  }
  if (did_subscribe) return;
  did_subscribe = true;
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
      timeline_token: timeline_token!,
    })
  );
}

function push_geo_keys(pos: { coords: { latitude: number; longitude: number } }): void {
  console.log('Geo request ok');
  geo_pending = false;
  geo_pos = pos;
  timeline_subscribe();
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
  console.log('JS started');
  geo_update_timer = setInterval(request_geo, 1000);
  request_geo();
}

function watchapp_alive(e: { payload?: Record<string, unknown> }): void {
  console.log('Watchapp is alive');
  if (geo_update_timer) clearInterval(geo_update_timer);
  const dict = e.payload;
  console.log('appmessage: ' + JSON.stringify(dict));
  try {
    if (dict && (dict as { PUSH_PIN?: unknown }).PUSH_PIN && typeof (window as unknown as { handlePushTimelinePin?: (d: Record<string, unknown>) => void }).handlePushTimelinePin === 'function') {
      (window as unknown as { handlePushTimelinePin: (d: Record<string, unknown>) => void }).handlePushTimelinePin(dict);
    }
  } catch (err) {
    console.log('Failed to handle message');
    console.log(err);
  }
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
      timeline_token = token;
      console.log('Timeline token callback', timeline_token);
      timeline_subscribe();
      fetchTimelineAndPushPins(api_host, Pebble.getAccountToken(), timeline_token);
    },
    (error: unknown) => {
      console.log('Error getting timeline token', error);
    }
  );
}

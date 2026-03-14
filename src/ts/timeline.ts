/** Timeline API root that coreapp will respond to */
const API_URL_ROOT = 'https://timeline-api.rebble.io';

async function putPin(pin: TimelinePin, timelineToken: string): Promise<void> {
  try {
    PebbleTS.insertTimelinePin(pin);
    return Promise.resolve();
  } catch (e) {
    console.log(e);
  }
  const url = API_URL_ROOT + '/v1/user/pins/' + pin.id;
  await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = resolve;
    xhr.onerror = reject;
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-User-Token', timelineToken);
    xhr.send(JSON.stringify(pin));
  });
}

/**
 * Fetch timeline pins from backend and push each to the Rebble timeline.
 */
export function fetchTimelineAndPushPins(
  apiHost: string,
  userToken: string,
  timelineToken: string
): void {
  if (!apiHost || !userToken || !timelineToken) {
    console.log('fetchTimelineAndPushPins: missing apiHost, userToken, or timelineToken');
    return;
  }
  const url = apiHost + '/timeline/' + encodeURIComponent(userToken);
  console.log('Fetching timeline from ' + url);

  const xhr = new XMLHttpRequest();
  xhr.open('GET', url);
  xhr.onload = () => {
    if (xhr.status !== 200) {
      console.log('Timeline fetch failed: ' + xhr.status);
      return;
    }
    let list: TimelinePin[];
    try {
      const json = JSON.parse(xhr.responseText);
      list = Array.isArray(json) ? json : (json.pins || json.items || []);
    } catch (e) {
      console.log('Timeline parse error', e);
      return;
    }
    console.log('Timeline pins:', list);
    list.forEach((pin: TimelinePin) => putPin(pin, timelineToken));
  };
  xhr.onerror = () => {
    console.log('Timeline fetch network error');
  };
  xhr.send();
}

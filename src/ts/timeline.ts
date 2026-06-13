/** Timeline API root that coreapp will respond to */
const API_URL_ROOT = 'https://timeline-api.rebble.io';

async function putPin(pin: TimelinePin): Promise<void> {
  try {
    PebbleTS.insertTimelinePin(pin);
    return Promise.resolve();
  } catch (e) {
    console.log(e);
  }
}

/**
 * Fetch timeline pins from backend and push each to the Rebble timeline.
 * @param onSuccess - optional callback when both fetch and all pin posts succeed.
 */
export function fetchTimelineAndPushPins(
  apiHost: string,
  userToken: string,
  onSuccess?: () => void
): void {
  if (!apiHost || !userToken) {
    console.log('fetchTimelineAndPushPins: missing apiHost or userToken');
    return;
  }
  const url = apiHost + '/timeline/' + encodeURIComponent(userToken);
  console.log('Fetching timeline from ' + url);

  const xhr = new XMLHttpRequest();
  xhr.open('GET', url);
  xhr.onload = async () => {
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
    console.log('Timeline pins:', list.length);
    try {
      for (const pin of list) {
        await putPin(pin);
      }
      onSuccess?.();
    } catch (e) {
      console.log('Pin post failed', e);
    }
  };
  xhr.onerror = () => {
    console.log('Timeline fetch network error');
  };
  xhr.send();
}

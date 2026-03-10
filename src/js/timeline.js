import { SECONDS_PER_DAY } from "./constants";

/** Timeline API root that coreapp will respond to */
const API_URL_ROOT = 'https://timeline-api.rebble.io';

/**
 * Send a request to the Rebble public web timeline API.
 *
 * @param {Object} pin The JSON pin to insert. Must contain 'id' field.
 */
const timelineRequest = async function(pin) {
  const url = API_URL_ROOT + "/v1/user/pins/" + pin.id;

  const token = await PebbleTS.getTimelineToken();

  // coreapp throws:
  //   InvalidStateError: Failed to execute 'send' on 'XMLHttpRequest': The object's state must be OPENED
  //
  // const res = await fetch(url, {
  //   method: 'PUT',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     'X-User-Token': token,
  //   },
  // });
  // const json = await res.json();
  // console.log(JSON.stringify(json));

  await new Promise(function(resolve) {
    var xhr = new XMLHttpRequest();
    xhr.onload = resolve;
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('X-User-Token', token);
    xhr.send(JSON.stringify(pin));
  });
};

/**
 * Handle request to push a timeline pin.
 */
export const handlePushTimelinePin = async function(dict) {
  var days = dict.DAYS_REMAINING;
  var rate = dict.DISCHARGE_RATE;

  // Put the pin in the future at noon, or today late if no days remaining
  var target = new Date(Date.now() + (days * SECONDS_PER_DAY * 1000));
  var targetHour = (days === 0 && new Date().getHours() > 12) ? 23 : 12;
  target.setHours(targetHour);
  target.setMinutes(0);
  target.setSeconds(0);

  // Create the pin
  var pin = {
    id: PIN_ID_PREDICTION,
    time: target,
    layout: {
      type: 'genericPin',
      title: 'Time to charge!',
      body: "Muninn predicts you will need to charge soon (Est. " + rate + "%/day)",
      // TODO: When SDK is fixed, use publishedMedia for custom icon
      tinyIcon: 'system://images/GENERIC_WARNING',
    },
  };

  console.log("Inserting pin: " + JSON.stringify(pin));
  try {
    await PebbleTS.insertTimelinePin(pin);
  } catch (e) {
    console.log(e);

    // Fallback method
    await timelineRequest(pin);
  }
  console.log('Pin insert returned');
};
/* ============================================================
   sun.mjs — when the sun rises and sets, for a given day and place.

   Fixed hours of six and six were close enough in Manila, where the
   day barely shifts through the year. But "close enough" means the
   app is wrong for half an hour twice a day, every day, and wrong by
   a great deal for anyone reading it from further north.

   This is the standard NOAA approximation, accurate to about a
   minute — far beyond what deciding between a light and a dark
   screen requires. No network, no service, no key: the sun's
   position is arithmetic.
   ============================================================ */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/* Days since the epoch used by the astronomical formulae. */
function julianDay(date){
  return date.getTime() / 86400000 - 0.5 + 2440588 - 2451545;
}

/* The sun's declination and the equation of time for a given day. */
function solar(d){
  const g = (357.529 + 0.98560028 * d) * RAD;          /* mean anomaly */
  const q = 280.459 + 0.98564736 * d;                  /* mean longitude */
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;

  const e = (23.439 - 0.00000036 * d) * RAD;           /* obliquity */
  const declination = Math.asin(Math.sin(e) * Math.sin(L));

  /* Equation of time, in minutes. */
  const y = Math.tan(e / 2) ** 2;
  const eqTime = 4 * DEG * (
    y * Math.sin(2 * q * RAD)
    - 2 * 0.0167 * Math.sin(g)
    + 4 * 0.0167 * y * Math.sin(g) * Math.cos(2 * q * RAD)
    - 0.5 * y * y * Math.sin(4 * q * RAD)
    - 1.25 * 0.0167 * 0.0167 * Math.sin(2 * g)
  );

  return { declination, eqTime };
}

/* Sunrise and sunset as Date objects for the day `now` falls in.

   Returns null where the sun does not rise or set at all — inside
   the polar circles in midsummer or midwinter, where there is no
   answer to give. The caller falls back to fixed hours. */
export function sunTimes(now, lat, lon){
  const midday = new Date(now);
  midday.setHours(12, 0, 0, 0);

  const d = julianDay(midday);
  const { declination, eqTime } = solar(d);

  /* The sun's centre is 0.833° below the horizon at the moment it
     appears, allowing for refraction and the width of the disc. */
  const zenith = 90.833 * RAD;
  const phi = lat * RAD;

  const cosH = (Math.cos(zenith) - Math.sin(phi) * Math.sin(declination)) /
               (Math.cos(phi) * Math.cos(declination));

  if(cosH > 1 || cosH < -1) return null;   /* no sunrise, or no sunset */

  const H = Math.acos(cosH) * DEG;         /* the hour angle, in degrees */

  /* Minutes from midnight, in local clock time. The offset undoes
     the fact that solar time is reckoned from Greenwich. */
  const offset = -midday.getTimezoneOffset();
  const noon = 720 - 4 * lon - eqTime + offset;

  const at = mins => {
    const t = new Date(midday);
    t.setHours(0, 0, 0, 0);
    t.setMinutes(Math.round(mins));
    return t;
  };

  return { sunrise: at(noon - 4 * H), sunset: at(noon + 4 * H) };
}

/* "day" or "night" for this moment. Falls back to the given hours
   where the sun neither rises nor sets. */
export function daylight(now, lat, lon, fromHour, untilHour){
  const t = sunTimes(now, lat, lon);
  if(!t){
    const h = now.getHours();
    return (h >= fromHour && h < untilHour) ? "day" : "night";
  }
  return (now >= t.sunrise && now < t.sunset) ? "day" : "night";
}

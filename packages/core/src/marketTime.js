// US market time helpers. No Intl, so they run the same in Node, browsers and React Native.

/** Hours from UTC to US Eastern time at a moment: -4 in daylight saving (2nd Sunday of March → 1st Sunday of November), else -5. */
export function etOffsetHours(unixSeconds) {
  const utc = new Date(unixSeconds * 1000);
  const y = utc.getUTCFullYear();
  const nthSunday = (month, n) => {
    const first = new Date(Date.UTC(y, month, 1)).getUTCDay();
    return 1 + ((7 - first) % 7) + 7 * (n - 1);
  };
  const dstStart = Date.UTC(y, 2, nthSunday(2, 2), 7); // 2:00 EST = 07:00 UTC
  const dstEnd = Date.UTC(y, 10, nthSunday(10, 1), 6); // 2:00 EDT = 06:00 UTC
  return utc.getTime() >= dstStart && utc.getTime() < dstEnd ? -4 : -5;
}

// US Eastern trading day of a bar (YYYYMMDD as a number)
export function tradingDay(unixSeconds) {
  const et = new Date((unixSeconds + etOffsetHours(unixSeconds) * 3600) * 1000);
  return et.getUTCFullYear() * 10000 + (et.getUTCMonth() + 1) * 100 + et.getUTCDate();
}

/** Unix time of 16:00 US Eastern on the given ET calendar date (y, month 0-11, d). */
export function etCloseTime(y, m, d) {
  const guess = Date.UTC(y, m, d, 21) / 1000; // 16:00 EST
  return guess + (etOffsetHours(guess) === -4 ? -3600 : 0);
}

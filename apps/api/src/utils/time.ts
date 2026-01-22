import { env } from '../env.js';

/**
 * Parse a compact human schedule string like:
 * "Mon-Fri 09:00-18:00; Sat 10:00-13:00"
 */
type Day = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun';
const dayIndex: Record<Day, number> = { Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6, Sun:0 };

function parseTime(s: string) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s.trim());
  if (!m) throw new Error(`Invalid time: ${s}`);
  return { h: parseInt(m[1],10), m: parseInt(m[2],10) };
}

export function isWithinHumanHours(date = new Date(), schedule = env.HUMAN_WORKING_HOURS) {
  // Uses local server time. In production, run server in env.TZ or use a tz lib.
  // Lightweight approach: assume server TZ is configured (recommended).
  const parts = schedule.split(';').map(x=>x.trim()).filter(Boolean);
  const dow = date.getDay(); // Sun=0
  const minutesNow = date.getHours()*60 + date.getMinutes();

  for (const p of parts) {
    // Example: "Mon-Fri 09:00-18:00" or "Sat 10:00-13:00"
    const mm = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:-(Mon|Tue|Wed|Thu|Fri|Sat|Sun))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(p);
    if (!mm) continue;
    const startDay = mm[1] as Day;
    const endDay = (mm[2] as Day) || (mm[1] as Day);
    const t1 = parseTime(mm[3]);
    const t2 = parseTime(mm[4]);
    const rangeDays: number[] = [];
    const sIdx = dayIndex[startDay];
    const eIdx = dayIndex[endDay];
    if (sIdx <= eIdx) {
      for (let i=sIdx;i<=eIdx;i++) rangeDays.push(i);
    } else {
      // wrap
      for (let i=sIdx;i<=6;i++) rangeDays.push(i);
      for (let i=0;i<=eIdx;i++) rangeDays.push(i);
    }

    const startMin = t1.h*60 + t1.m;
    const endMin = t2.h*60 + t2.m;

    if (rangeDays.includes(dow)) {
      if (startMin <= endMin) {
        if (minutesNow >= startMin && minutesNow <= endMin) return true;
      } else {
        // overnight window
        if (minutesNow >= startMin || minutesNow <= endMin) return true;
      }
    }
  }

  return false;
}

export function minutesBetween(a: Date, b: Date) {
  return Math.floor((a.getTime()-b.getTime())/60000);
}

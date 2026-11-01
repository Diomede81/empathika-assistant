/**
 * A friendly description of what an action is doing, for the face ("🩺 Checking the care record…")
 * and, if it takes a moment, for Empathika to say. Instant actions (time, timers, modes) return
 * undefined: nothing to show.
 */
export interface Activity {
  icon: string;
  label: string;
}

const INSTANT = new Set([
  'get_current_datetime', 'set_timer', 'set_reminder', 'list_timers', 'cancel_timer', 'end_conversation', 'staff_session', 'device_power', 'device_settings', 'show_on_screen',
]);

const CHANGING = /(ADD|CREATE|UPDATE|RECORD|LOG|DELETE)/;

export function describeActivity(name: string): Activity | undefined {
  if (INSTANT.has(name)) return undefined;
  const n = name.toUpperCase();
  if (name === 'health_plan') return { icon: '🏋️', label: 'Preparing your plan' };
  if (name === 'meals') return { icon: '🥗', label: 'Checking your meal plan' };
  if (name === 'health_summary') return { icon: '❤️', label: 'Checking your health log' };
  if (name === 'work_on_task') return { icon: '🧠', label: 'Working it out' };
  if (name === 'recall') return { icon: '🧠', label: 'Checking my memory' };
  if (name === 'remember' || name === 'forget') return { icon: '🧠', label: 'Updating my memory' };
  if (name === 'family_news') return { icon: '💌', label: 'Looking at messages from family' };
  if (name === 'software_update') return { icon: '⬇️', label: 'Checking for updates' };
  if (name === 'web_search') return { icon: '🌐', label: 'Searching the web' };
  if (name === 'train_departures') return { icon: '🚆', label: 'Checking the trains' };
  if (name === 'plan_train_journey') return { icon: '🚆', label: 'Planning your journey' };
  if (name === 'read_webpage') return { icon: '🌐', label: 'Reading the page' };
  if (/^RESIDENT_(PROFILE|SCHEDULE)/.test(n)) return { icon: '📅', label: 'Checking today\'s plans' };
  if (/^(RESIDENT|CARE|MEDICATION|OBSERVATION)/.test(n)) return { icon: '🩺', label: CHANGING.test(n) ? 'Updating the care record' : 'Checking the care record' };
  return { icon: '⚙️', label: 'Working on it' };
}

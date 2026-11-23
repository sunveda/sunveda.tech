// Shared by the browser form and the Apps Script submission handler.
const DAYS = ['nagpur13', 'nagpur14', 'patna17'];
const GUEST_LIMIT = 50;
function field_(value, limit, message, required) {
  if (value == null && !required) return '';
  if (typeof value !== 'string') throw new Error(message);
  const text = value.trim();
  if ((required && !text) || text.length > limit) throw new Error(message);
  return text;
}
function phoneKey_(phone) {
  const text = phone
    .replace(/[०-९]/g, (c) => String('०१२३४५६७८९'.indexOf(c)))
    .replace(/[\s()-]/g, '');
  if (text.startsWith('+91') && !/^\+91\d{10}$/.test(text))
    throw new Error('badPhone');
  if (/^\+[1-9]\d{7,14}$/.test(text)) return text.slice(1);
  if (/^[0-9]{10}$/.test(text)) return '91' + text;
  if (/^0[0-9]{10}$/.test(text)) return '91' + text.slice(1);
  if (/^91[0-9]{10}$/.test(text)) return text;
  throw new Error('badPhone');
}
function validate_(p) {
  if (!p || !['yes', 'no'].includes(p.attending)) throw new Error('badStatus');
  const name = field_(p.name, 100, 'badName', true);
  const phone = field_(p.phone, 32, 'badPhone', true);
  phoneKey_(phone);
  const email = field_(p.email, 200, 'badEmail', false);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('badEmail');
  const note = field_(p.note, 500, 'badNote', false);
  const response = {
    name,
    phone,
    email,
    note,
    attending: p.attending,
    days: [],
    guests: []
  };
  if (p.attending === 'no') return response;
  if (
    !Array.isArray(p.days) ||
    !p.days.length ||
    p.days.some((day) => !DAYS.includes(day))
  ) {
    throw new Error('badDays');
  }
  response.days = DAYS.filter((day) => p.days.includes(day));
  if (!Array.isArray(p.guests) || p.guests.length >= GUEST_LIMIT)
    throw new Error('badCount');
  response.guests = p.guests.map((person) => {
    if (!person || !['adult', 'child'].includes(person.group))
      throw new Error('badGroup');
    return {
      name: field_(person.name, 100, 'badGuest', true),
      group: person.group
    };
  });
  return response;
}

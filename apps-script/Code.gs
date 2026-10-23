/**
 * Fresher to CM — application intake.
 *
 * Paste into the sheet's Extensions → Apps Script, then Deploy → New
 * deployment → Web app (Execute as: Me, Who has access: Anyone). Put the
 * /exec URL in web/.env.local as VITE_SHEETS_WEBAPP_URL.
 *
 * Apps Script can't set HTTP status codes, so every reply is 200 with
 * { ok, status, message, details } and the page reads `status` from the body.
 */

const SHEET_NAME = 'Sheet1';
const HEADERS = [
  'Submitted at', 'Name', 'Phone', 'Email', 'City', 'Experience',
  'Degree', 'College', 'Previous experience', 'LinkedIn / portfolio', 'Answer', 'Audio / video link',
];

const CITIES = ['delhi', 'gurgaon', 'noida', 'jaipur', 'bangalore', 'mumbai', 'hyderabad', 'lucknow', 'chennai', 'chandigarh'];
const EXPERIENCE = ['studying', 'fresher', 'under_1_year', '1_2_years', 'over_2_years'];

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply(400, 'That didn\'t send.');
  }

  // Honeypot: pretend success so bots don't learn anything.
  if (str(data.company)) return reply(201, 'Application received.');

  const v = {
    name: str(data.name, 120),
    phone: str(data.phone, 20).replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, ''),
    email: str(data.email, 254).toLowerCase(),
    city: str(data.city),
    experience: str(data.experience),
    degree: str(data.degree, 120),
    college: str(data.college, 160),
    previousExperience: str(data.previousExperience, 1000),
    link: str(data.link, 500),
    answer: str(data.answer, 2000),
    mediaLink: str(data.mediaLink, 500),
  };

  const details = {};
  if (v.name.length < 2) details.name = ['Enter your full name'];
  if (!/^[6-9]\d{9}$/.test(v.phone)) details.phone = ['Enter a valid 10-digit Indian mobile number'];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) details.email = ['Enter a valid email'];
  if (CITIES.indexOf(v.city) < 0) details.city = ['Select a city'];
  if (EXPERIENCE.indexOf(v.experience) < 0) details.experience = ['Select your experience level'];
  if (v.degree.length < 2) details.degree = ['Enter your degree or highest qualification'];
  if (v.link && !/^https?:\/\//i.test(v.link)) details.link = ['Link must start with http:// or https://'];
  if (v.mediaLink && !/^https?:\/\//i.test(v.mediaLink)) details.mediaLink = ['Link must start with http:// or https://'];
  // A recorded pitch replaces the written answer.
  if (!v.mediaLink && v.answer.length < 60) details.answer = ['Write at least 60 characters, or add an audio/video link'];
  if (Object.keys(details).length) return reply(400, 'Check the highlighted fields.', details);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);

    // One application per phone or email.
    const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 3, sheet.getLastRow() - 1, 2).getValues() : [];
    if (rows.some(function (r) { return String(r[0]) === v.phone || String(r[1]).toLowerCase() === v.email; })) {
      return reply(409, 'An application with this phone or email already exists.');
    }

    sheet.appendRow([
      new Date(), v.name, "'" + v.phone, v.email, v.city, v.experience,
      v.degree, v.college, v.previousExperience, v.link, v.answer, v.mediaLink,
    ].map(safe));
  } finally {
    lock.releaseLock();
  }
  return reply(201, 'Application received.');
}

function str(value, max) {
  const s = String(value == null ? '' : value).trim();
  return max ? s.slice(0, max) : s;
}

// A leading = + - @ would run as a formula in the sheet.
function safe(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

function reply(status, message, details) {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: status < 300, status: status, message: message, details: details }))
    .setMimeType(ContentService.MimeType.JSON);
}

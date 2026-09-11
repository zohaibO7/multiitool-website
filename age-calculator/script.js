/* ==========================================================================
   MultiTool -- tools/age-calculator/script.js
   --------------------------------------------------------------------------
   Copied from tools/word-counter/script.js. Same rules: IIFE, no globals,
   pure functions first, DOM work only inside MT.ready(), pure ASCII source.

   Age in years/months/days is computed the way people do it: take whole
   years off the reference date, then whole months off what remains, then
   count the leftover days. addMonths() clamps month-end and 29-February
   dates to the real calendar so the three parts always add back up to the
   total day count.
   ========================================================================== */

/* global window, document, MT */

(function () {
  'use strict';

  if (typeof MT === 'undefined') return;

  var BIRTH_KEY = 'multitool-age-calculator-birth';
  var REF_KEY = 'multitool-age-calculator-ref';

  var WEEKDAYS = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];
  var MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  /* Both built from their code points to keep this file pure ASCII: a
     <script src> inherits the document's encoding, so a literal character
     here could silently stop matching if that ever changed. */
  var MIDDLE_DOT = String.fromCharCode(0x00b7);
  var EM_DASH = String.fromCharCode(0x2014);

  /* ======================================================================
     1. DATE CORE -- pure functions, no DOM, no side effects.
     A date is a plain { y, m, d } object; months run 1..12.
     ====================================================================== */

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  /**
   * Days in a month, month 1..12.
   * @param {number} year
   * @param {number} month 1..12
   * @returns {number}
   */
  function daysInMonth(year, month) {
    if (month === 2) return isLeapYear(year) ? 29 : 28;
    return [4, 6, 9, 11].indexOf(month) !== -1 ? 30 : 31;
  }

  /**
   * Parse an ISO date string ("YYYY-MM-DD", as <input type="date"> gives)
   * into a { y, m, d } object. Rejects malformed strings and calendar
   * dates that do not exist (e.g. "2025-02-29" in a common year).
   * @param {string} str
   * @returns {{ y: number, m: number, d: number }|null}
   */
  function parseYmd(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (mo < 1 || mo > 12) return null;
    if (d < 1 || d > daysInMonth(y, mo)) return null;
    return { y: y, m: mo, d: d };
  }

  /**
   * Compare two dates. -1 / 0 / 1.
   * @param {{ y: number, m: number, d: number }} a
   * @param {{ y: number, m: number, d: number }} b
   * @returns {number}
   */
  function cmpDates(a, b) {
    if (a.y !== b.y) return a.y < b.y ? -1 : 1;
    if (a.m !== b.m) return a.m < b.m ? -1 : 1;
    if (a.d !== b.d) return a.d < b.d ? -1 : 1;
    return 0;
  }

  /**
   * Add a number of months to a date, clamping the day to the last valid
   * day of the target month. So 31 March + 1 month is 30 April, and
   * 29 February + 12 months is 28 February in a common year.
   * @param {number} y
   * @param {number} m 1..12
   * @param {number} d
   * @param {number} offset whole months, can be negative
   * @returns {{ y: number, m: number, d: number }}
   */
  function addMonths(y, m, d, offset) {
    var total = y * 12 + (m - 1) + offset;
    var year = Math.floor(total / 12);
    var month = ((total % 12) + 12) % 12 + 1;
    var max = daysInMonth(year, month);
    return { y: year, m: month, d: Math.min(d, max) };
  }

  /**
   * Days since a fixed epoch, in a DST-free scale (UTC midnight). The
   * difference of two day numbers is an exact whole-day span.
   * @param {number} y
   * @param {number} m 1..12
   * @param {number} d
   * @returns {number}
   */
  function dayNumber(y, m, d) {
    return Date.UTC(y, m - 1, d) / 86400000;
  }

  /**
   * Whole days from a to b: 1 for consecutive days (1 Jan -> 2 Jan).
   * @param {{ y: number, m: number, d: number }} a
   * @param {{ y: number, m: number, d: number }} b
   * @returns {number}
   */
  function daysBetween(a, b) {
    return dayNumber(b.y, b.m, b.d) - dayNumber(a.y, a.m, a.d);
  }

  /**
   * The exact age in years, months and days, plus the total-day measures.
   * @param {{ y: number, m: number, d: number }} birth
   * @param {{ y: number, m: number, d: number }} ref
   * @returns {{
   *   valid: boolean,
   *   reason?: string,
   *   years?: number, months?: number, days?: number,
   *   totalMonths?: number, totalDays?: number,
   *   totalWeeks?: number, weekDays?: number
   * }}
   */
  function ageBreakdown(birth, ref) {
    if (cmpDates(birth, ref) > 0) {
      return { valid: false, reason: 'future' };
    }

    // Whole years: birth + N years must not pass the reference date.
    var years = ref.y - birth.y;
    var anchor = addMonths(birth.y, birth.m, birth.d, years * 12);
    if (cmpDates(anchor, ref) > 0) {
      years--;
      anchor = addMonths(birth.y, birth.m, birth.d, years * 12);
    }

    // Whole months on top of that: birth + (years*12 + months + 1) must
    // not pass the reference date either. The 1200 guard is unreachable
    // in practice but keeps the loop bounded for absurd inputs.
    var months = 0;
    var next = addMonths(birth.y, birth.m, birth.d, years * 12 + 1);
    while (months < 1200 && cmpDates(next, ref) <= 0) {
      months++;
      next = addMonths(birth.y, birth.m, birth.d, years * 12 + months + 1);
    }
    var monthAnchor = addMonths(birth.y, birth.m, birth.d, years * 12 + months);

    var totalDays = daysBetween(birth, ref);

    return {
      valid: true,
      years: years,
      months: months,
      days: daysBetween(monthAnchor, ref),
      totalMonths: years * 12 + months,
      totalDays: totalDays,
      totalWeeks: Math.floor(totalDays / 7),
      weekDays: totalDays % 7
    };
  }

  /**
   * The birthday that comes at or after the reference date. A 29-February
   * birthday uses the last day of February in common years.
   * @param {{ y: number, m: number, d: number }} birth
   * @param {{ y: number, m: number, d: number }} ref
   * @returns {{
   *   next: { y: number, m: number, d: number },
   *   turnsAge: number,
   *   daysUntil: number,
   *   isToday: boolean
   * }}
   */
  function nextBirthday(birth, ref) {
    var offset = ref.y - birth.y;
    var bday = addMonths(birth.y, birth.m, birth.d, offset * 12);
    if (cmpDates(bday, ref) < 0) {
      bday = addMonths(birth.y, birth.m, birth.d, (offset + 1) * 12);
    }
    var isToday = cmpDates(bday, ref) === 0;
    return {
      next: bday,
      turnsAge: bday.y - birth.y,
      daysUntil: isToday ? 0 : daysBetween(ref, bday),
      isToday: isToday
    };
  }

  /**
   * The English weekday name of a calendar date.
   * @param {number} y
   * @param {number} m 1..12
   * @param {number} d
   * @returns {string}
   */
  function weekdayName(y, m, d) {
    return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }

  /* ======================================================================
     2. PAGE WIRING
     ====================================================================== */

  MT.ready(function () {
    var birthInput = MT.$('#birth-input');
    if (!birthInput) return; // not this page

    var refInput = MT.$('#ref-input');
    var todayBtn = MT.$('#today-btn');
    var clearBtn = MT.$('#clear-btn');
    var ageOutput = MT.$('#age-output');
    var placeholder = MT.$('#age-placeholder');
    var detailLine = MT.$('#detail-line');
    var errorNote = MT.$('#error-note');
    var restoredNote = MT.$('#restored-note');

    var statMonths = MT.$('#stat-months');
    var statDays = MT.$('#stat-days');
    var statWeeks = MT.$('#stat-weeks');
    var statBirthday = MT.$('#stat-birthday');

    function todayYmd() {
      var t = new Date();
      return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
    }

    function setStat(el, value) {
      if (el) el.textContent = value;
    }

    function plural(n, one, many) {
      return MT.formatNumber(n) + ' ' + (n === 1 ? one : many);
    }

    function formatDate(ymd) {
      return ymd.d + ' ' + MONTHS[ymd.m - 1] + ' ' + ymd.y;
    }

    function ageText(bd) {
      var parts = [];
      if (bd.years) parts.push(plural(bd.years, 'year', 'years'));
      if (bd.months) parts.push(plural(bd.months, 'month', 'months'));
      if (bd.days) parts.push(plural(bd.days, 'day', 'days'));
      if (!parts.length) parts.push('0 days');
      return parts.join(' ');
    }

    /* The reference date defaults to today, so the input can be left
       empty and still mean "now". */
    function currentRef() {
      var v = refInput && refInput.value;
      if (v) return parseYmd(v);
      return parseYmd(todayYmd());
    }

    /* ---- painting ---------------------------------------------------- */

    function paintEmpty() {
      if (ageOutput) ageOutput.textContent = '';
      if (placeholder) placeholder.hidden = false;
      if (detailLine) detailLine.textContent = 'Enter a birth date to see the exact age.';
      setStat(statMonths, '0');
      setStat(statDays, '0');
      setStat(statWeeks, '0');
      setStat(statBirthday, EM_DASH);
    }

    function paint() {
      if (errorNote) errorNote.hidden = true;

      var birth = parseYmd(birthInput.value);
      if (!birth) {
        paintEmpty();
        return;
      }

      var ref = currentRef();
      var bd = ageBreakdown(birth, ref);
      if (!bd.valid) {
        // A future birth date: leave the working state blank and explain.
        paintEmpty();
        if (errorNote) errorNote.hidden = false;
        return;
      }

      var nb = nextBirthday(birth, ref);

      if (ageOutput) ageOutput.textContent = ageText(bd);
      if (placeholder) placeholder.hidden = true;

      setStat(statMonths, MT.formatNumber(bd.totalMonths));
      setStat(statDays, MT.formatNumber(bd.totalDays));
      setStat(statWeeks, MT.formatNumber(bd.totalWeeks));
      setStat(statBirthday, nb.isToday ? 'Today' :
        plural(nb.daysUntil, 'day', 'days'));

      if (!detailLine) return;

      var line = 'Born on a ' + weekdayName(birth.y, birth.m, birth.d);
      line += ' ' + MIDDLE_DOT + ' ';
      if (nb.isToday) {
        line += 'the birthday is today ' + MIDDLE_DOT + ' turns ' + nb.turnsAge;
      } else {
        line += plural(nb.daysUntil, 'day', 'days') + ' until the next birthday';
        line += ' ' + MIDDLE_DOT + ' turns ' + nb.turnsAge + ' on ' + formatDate(nb.next);
      }
      if (bd.weekDays && bd.totalWeeks) {
        line += ' ' + MIDDLE_DOT + ' ' + MT.formatNumber(bd.totalWeeks) +
          (bd.totalWeeks === 1 ? ' week and ' : ' weeks and ') + bd.weekDays +
          (bd.weekDays === 1 ? ' day' : ' days');
      }
      detailLine.textContent = line;
    }

    /* ---- state ------------------------------------------------------- */

    function saveBirth() {
      if (birthInput.value) MT.store.set(BIRTH_KEY, birthInput.value);
      else MT.store.remove(BIRTH_KEY);
    }

    function saveRef() {
      if (refInput && refInput.value) MT.store.set(REF_KEY, refInput.value);
      else if (refInput) MT.store.remove(REF_KEY);
    }

    /* ---- events ------------------------------------------------------ */

    birthInput.addEventListener('change', function () {
      if (restoredNote) restoredNote.hidden = true;
      saveBirth();
      paint();
    });

    if (refInput) {
      refInput.addEventListener('change', function () {
        if (restoredNote) restoredNote.hidden = true;
        saveRef();
        paint();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', function () {
        if (refInput) refInput.value = todayYmd();
        saveRef();
        paint();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        birthInput.value = '';
        if (refInput) refInput.value = '';
        if (restoredNote) restoredNote.hidden = true;
        saveBirth();
        saveRef();
        paint();
        birthInput.focus();
      });
    }

    /* ---- first render ------------------------------------------------ */

    var savedBirth = MT.store.get(BIRTH_KEY, '');
    if (savedBirth) birthInput.value = savedBirth;
    if (refInput) {
      var savedRef = MT.store.get(REF_KEY, '');
      if (savedRef) refInput.value = savedRef;
    }
    if ((savedBirth || MT.store.get(REF_KEY, '')) && restoredNote) {
      restoredNote.hidden = false;
    }

    paint();
  });
})();
import {
  WorkingCalendar,
  addBusinessDays,
  getZonedParts,
  isWorkingDay,
  zonedTimeToUtc,
} from './business-hours.util';

const RIYADH: WorkingCalendar = {
  timezone: 'Asia/Riyadh', // UTC+3, no DST
  workingDays: [0, 1, 2, 3, 4], // Sun–Thu
  workStartHour: 9,
  workEndHour: 18,
};

const DUBAI: WorkingCalendar = {
  timezone: 'Asia/Dubai', // UTC+4, no DST
  workingDays: [1, 2, 3, 4, 5], // Mon–Fri
  workStartHour: 9,
  workEndHour: 18,
};

const BANGALORE: WorkingCalendar = {
  timezone: 'Asia/Kolkata', // UTC+5:30, no DST
  workingDays: [1, 2, 3, 4, 5], // Mon–Fri
  workStartHour: 9,
  workEndHour: 18,
};

describe('business-hours.util', () => {
  describe('getZonedParts', () => {
    it('renders a UTC instant in the office timezone', () => {
      // 2026-08-04T21:00Z → 2026-08-05 00:00 in Riyadh (UTC+3)
      const parts = getZonedParts(
        new Date('2026-08-04T21:00:00Z'),
        'Asia/Riyadh',
      );
      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(8);
      expect(parts.day).toBe(5);
      expect(parts.hour).toBe(0);
    });

    it('handles the half-hour India offset', () => {
      // 2026-08-04T20:00Z → 2026-08-05 01:30 IST (UTC+5:30)
      const parts = getZonedParts(
        new Date('2026-08-04T20:00:00Z'),
        'Asia/Kolkata',
      );
      expect(parts.day).toBe(5);
      expect(parts.hour).toBe(1);
      expect(parts.minute).toBe(30);
    });
  });

  describe('zonedTimeToUtc', () => {
    it('converts Riyadh wall clock to UTC', () => {
      const utc = zonedTimeToUtc(2026, 8, 5, 18, 0, 'Asia/Riyadh');
      expect(utc.toISOString()).toBe('2026-08-05T15:00:00.000Z');
    });

    it('converts Bangalore wall clock to UTC across the half-hour offset', () => {
      const utc = zonedTimeToUtc(2026, 8, 5, 18, 0, 'Asia/Kolkata');
      expect(utc.toISOString()).toBe('2026-08-05T12:30:00.000Z');
    });
  });

  describe('isWorkingDay', () => {
    it('treats Friday as a non-working day in Riyadh', () => {
      // 2026-08-07 is a Friday
      expect(isWorkingDay(new Date('2026-08-07T09:00:00Z'), RIYADH)).toBe(
        false,
      );
    });

    it('treats Sunday as a working day in Riyadh', () => {
      // 2026-08-09 is a Sunday
      expect(isWorkingDay(new Date('2026-08-09T09:00:00Z'), RIYADH)).toBe(true);
    });

    it('treats Sunday as a non-working day in Dubai', () => {
      expect(isWorkingDay(new Date('2026-08-09T09:00:00Z'), DUBAI)).toBe(false);
    });
  });

  describe('addBusinessDays', () => {
    it('rolls a Thursday Riyadh enquiry over the weekend to Sunday', () => {
      // Thu 2026-08-06 17:00 AST = 14:00Z
      const due = addBusinessDays(new Date('2026-08-06T14:00:00Z'), 1, RIYADH);
      // Expected: Sun 2026-08-09 18:00 AST = 15:00Z
      expect(due.toISOString()).toBe('2026-08-09T15:00:00.000Z');
    });

    it('gives the next calendar day for a mid-week Riyadh enquiry', () => {
      // Mon 2026-08-03 10:00 AST = 07:00Z
      const due = addBusinessDays(new Date('2026-08-03T07:00:00Z'), 1, RIYADH);
      // Expected: Tue 2026-08-04 18:00 AST = 15:00Z
      expect(due.toISOString()).toBe('2026-08-04T15:00:00.000Z');
    });

    it('rolls a Thursday Dubai enquiry to Friday, not the weekend', () => {
      // Thu 2026-08-06 17:00 GST = 13:00Z
      const due = addBusinessDays(new Date('2026-08-06T13:00:00Z'), 1, DUBAI);
      // Expected: Fri 2026-08-07 18:00 GST = 14:00Z
      expect(due.toISOString()).toBe('2026-08-07T14:00:00.000Z');
    });

    it('rolls a Friday Bangalore enquiry to Monday', () => {
      // Fri 2026-08-07 17:00 IST = 11:30Z
      const due = addBusinessDays(
        new Date('2026-08-07T11:30:00Z'),
        1,
        BANGALORE,
      );
      // Expected: Mon 2026-08-10 18:00 IST = 12:30Z
      expect(due.toISOString()).toBe('2026-08-10T12:30:00.000Z');
    });

    it('the same instant yields different due dates per office', () => {
      // Thu 2026-08-06 14:00Z
      const instant = new Date('2026-08-06T14:00:00Z');
      const riyadhDue = addBusinessDays(instant, 1, RIYADH);
      const dubaiDue = addBusinessDays(instant, 1, DUBAI);

      // Riyadh waits for Sunday; Dubai answers Friday.
      expect(riyadhDue.getTime()).toBeGreaterThan(dubaiDue.getTime());
    });

    it('supports multi-day SLAs such as the ten-day hiring response', () => {
      // Mon 2026-08-03 07:00Z, Bangalore
      const due = addBusinessDays(
        new Date('2026-08-03T07:00:00Z'),
        10,
        BANGALORE,
      );
      // 10 working days after Mon 03 Aug = Mon 17 Aug, 18:00 IST = 12:30Z
      expect(due.toISOString()).toBe('2026-08-17T12:30:00.000Z');
    });

    it('rejects a zero or negative SLA', () => {
      expect(() =>
        addBusinessDays(new Date('2026-08-03T07:00:00Z'), 0, RIYADH),
      ).toThrow('businessDays must be at least 1');
    });

    it('skips a supplied holiday when counting', () => {
      // Mon 2026-08-03 07:00Z, Bangalore. Without holidays the answer is Tue 4th.
      const from = new Date('2026-08-03T07:00:00Z');
      expect(addBusinessDays(from, 1, BANGALORE).toISOString()).toBe(
        '2026-08-04T12:30:00.000Z',
      );
      // Declaring the 4th a holiday pushes it to Wed 5th.
      expect(
        addBusinessDays(from, 1, BANGALORE, ['2026-08-04']).toISOString(),
      ).toBe('2026-08-05T12:30:00.000Z');
    });

    it('skips consecutive holidays, as a multi-day Eid would', () => {
      const from = new Date('2026-08-03T07:00:00Z');
      expect(
        addBusinessDays(from, 1, BANGALORE, [
          '2026-08-04',
          '2026-08-05',
          '2026-08-06',
        ]).toISOString(),
      ).toBe('2026-08-07T12:30:00.000Z');
    });

    it('behaves identically when no holidays are supplied', () => {
      const from = new Date('2026-08-06T14:00:00Z');
      expect(addBusinessDays(from, 1, RIYADH).toISOString()).toBe(
        addBusinessDays(from, 1, RIYADH, []).toISOString(),
      );
    });

    it('rejects an empty working calendar', () => {
      expect(() =>
        addBusinessDays(new Date('2026-08-03T07:00:00Z'), 1, {
          ...RIYADH,
          workingDays: [],
        }),
      ).toThrow('at least one working day');
    });
  });
});

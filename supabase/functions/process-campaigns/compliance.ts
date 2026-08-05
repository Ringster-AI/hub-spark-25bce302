// Calling-hours + consent guardrails for outbound campaigns.
// Federal TCPA telemarketing window is 8:00am–9:00pm in the CALLED PARTY's local time.

export const TCPA_EARLIEST_HOUR = 8;
export const TCPA_LATEST_HOUR = 21;

export interface BusinessHours {
  start: string; // "09:00"
  end: string; // "17:00"
  timezone: string; // IANA tz
  days: number[]; // 0=Sun .. 6=Sat
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  start: '09:00',
  end: '17:00',
  timezone: 'America/New_York',
  days: [1, 2, 3, 4, 5],
};

/** Returns { day, minutes } for `now` rendered in the given IANA timezone. */
export function zonedNow(timeZone: string, now: Date = new Date()): { day: number; minutes: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  } catch {
    // Unknown timezone -> fall back to UTC rather than server-local time.
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now);
  }

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[get('weekday')] ?? 0;
  const hour = parseInt(get('hour'), 10) % 24;
  const minute = parseInt(get('minute'), 10);
  return { day, minutes: hour * 60 + minute };
}

function toMinutes(hhmm: string): number {
  const [h, m] = (hhmm || '0:00').split(':').map((v) => parseInt(v, 10));
  return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
}

/** Timezone-aware business-hours check for the campaign's configured window. */
export function isWithinBusinessHours(businessHours: Partial<BusinessHours> | null | undefined, now = new Date()): boolean {
  const bh = { ...DEFAULT_BUSINESS_HOURS, ...(businessHours || {}) } as BusinessHours;
  const { day, minutes } = zonedNow(bh.timezone, now);
  if (Array.isArray(bh.days) && !bh.days.includes(day)) return false;
  return minutes >= toMinutes(bh.start) && minutes <= toMinutes(bh.end);
}

// North American area code -> IANA timezone (best-effort; unknown codes fall back to campaign tz).
const AREA_CODE_TZ: Record<string, string> = {};
const TZ_GROUPS: Record<string, string[]> = {
  'America/New_York': ['201','202','203','207','212','215','216','223','227','229','231','234','236','239','240','242','246','267','272','274','276','278','283','289','301','302','304','305','313','315','321','325','326','330','331','332','339','340','343','345','346','347','351','352','354','363','365','367','380','386','401','404','405','407','410','412','413','416','418','419','423','424','434','437','438','440','441','443','445','448','450','458','463','464','469','470','473','475','478','484','504','506','508','512','513','514','516','517','518','519','520','534','539','540','541','548','551','557','561','567','570','571','572','573','579','581','585','586','587','589','598','603','606','607','609','610','613','614','615','616','617','623','626','628','629','631','636','646','647','649','650','657','658','667','670','671','672','678','680','681','689','700','703','704','705','706','709','712','713','715','716','717','718','719','724','725','726','727','731','732','734','737','740','743','747','753','754','757','758','760','762','763','765','767','769','770','771','772','773','774','775','778','779','780','781','782','784','785','786','787','801','802','803','804','805','806','807','808','809','810','812','813','814','815','816','817','818','819','820','825','828','829','830','831','832','838','839','843','845','847','848','849','850','854','856','857','858','859','860','862','863','864','865','867','868','869','870','872','873','876','878','879','902','903','904','905','906','907','908','909','910','912','913','914','915','916','917','918','919','920','925','928','929','930','931','934','936','937','938','939','940','941','943','945','947','948','949','951','952','954','956','959','970','971','972','973','978','979','980','984','985','986','989'],
};
// Explicit overrides for the major non-Eastern zones.
const OVERRIDES: Record<string, string[]> = {
  'America/Chicago': ['205','214','217','218','224','225','251','256','262','270','309','312','314','316','318','319','320','323','325','334','337','346','361','380','405','409','414','417','430','432','435','469','479','501','504','507','512','515','531','534','539','551','563','573','580','585','601','605','608','612','615','618','620','630','636','641','651','660','662','678','682','708','712','713','715','731','737','763','769','773','779','785','806','808','812','815','816','817','830','832','847','850','854','859','863','870','872','901','903','913','915','918','920','931','936','940','952','956','972','979','985'],
  'America/Denver': ['303','307','385','406','435','505','575','719','720','801','928','970','986'],
  'America/Phoenix': ['480','520','602','623','928'],
  'America/Los_Angeles': ['206','209','213','253','279','310','323','341','360','408','415','424','425','442','503','510','530','541','559','562','564','569','619','626','628','650','657','661','669','679','702','707','714','725','747','760','775','805','818','820','825','831','837','840','858','909','916','925','935','949','951','971'],
  'America/Anchorage': ['907'],
  'Pacific/Honolulu': ['808'],
  'America/Toronto': ['226','249','289','343','365','416','437','519','548','613','647','683','705','742','753','807','905'],
  'America/Vancouver': ['236','250','604','672','778'],
  'America/Edmonton': ['368','403','587','780','825'],
  'America/Winnipeg': ['204','306','431','474','639'],
};
for (const code of TZ_GROUPS['America/New_York']) AREA_CODE_TZ[code] = 'America/New_York';
for (const [tz, codes] of Object.entries(OVERRIDES)) for (const code of codes) AREA_CODE_TZ[code] = tz;

export function timezoneForPhone(phone: string): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length < 3) return null;
  return AREA_CODE_TZ[national.slice(0, 3)] ?? null;
}

/**
 * Hard TCPA guardrail: never dial a contact outside 8am–9pm in their own local time.
 * Falls back to the campaign timezone when the area code is unknown.
 */
export function isWithinCalledPartyWindow(phone: string, fallbackTimezone: string, now = new Date()): boolean {
  const tz = timezoneForPhone(phone) ?? fallbackTimezone;
  const { minutes } = zonedNow(tz, now);
  return minutes >= TCPA_EARLIEST_HOUR * 60 && minutes < TCPA_LATEST_HOUR * 60;
}

/** Normalize to digits-only national/E.164-ish form for suppression matching. */
export function normalizeForDnc(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

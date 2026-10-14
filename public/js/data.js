'use strict';
// ---- Static game data: airports, airlines, aircraft, translations, graph builder ----
const W = 1600, H = 900;

const AIRLINES = {
  EK: { n: 'Emirates', full: 'Emirates', tail: '#d71920', acc: '#c9a24b', body: '#f1f1f1' },
  QR: { n: 'Qatari', full: 'Qatar Airways', tail: '#701c45', acc: '#9a9da3', body: '#ececee' },
  TK: { n: 'Turkish', full: 'Turkish Airlines', tail: '#d8141c', acc: '#ffffff', body: '#f6f6f6' },
  LH: { n: 'Lufthansa', full: 'Lufthansa', tail: '#0a1e5c', acc: '#ffb400', body: '#f2f4f7' },
  MS: { n: 'Egyptair', full: 'EgyptAir', tail: '#1e4f9a', acc: '#f2c200', body: '#f0f2f5' },
  SV: { n: 'Saudia', full: 'Saudia', tail: '#0b6b3a', acc: '#2fa4d8', body: '#f2f5f3' },
  BA: { n: 'Speedbird', full: 'British Airways', tail: '#1b3a78', acc: '#d3202f', body: '#e9ebee' },
  EY: { n: 'Etihad', full: 'Etihad Airways', tail: '#b79a5a', acc: '#6b5a2a', body: '#f1eee8' },
  AA: { n: 'American', full: 'American Airlines', tail: '#9aa3ab', acc: '#c1262d', body: '#c7ccd1' },
  DL: { n: 'Delta', full: 'Delta Air Lines', tail: '#c01933', acc: '#12315c', body: '#f0f1f3' },
  AF: { n: 'Air France', full: 'Air France', tail: '#0b2a63', acc: '#e11b22', body: '#f3f4f6' }
};
const CITY = { London: 'LHR', Dubai: 'DXB', Cairo: 'CAI', Doha: 'DOH', Istanbul: 'IST', Frankfurt: 'FRA', Riyadh: 'RUH', Jeddah: 'JED', Amman: 'AMM',
  Paris: 'CDG', 'New York': 'JFK', Mumbai: 'BOM', Singapore: 'SIN', Sydney: 'SYD', Delhi: 'DEL', 'Los Angeles': 'LAX', Chicago: 'ORD' };
const cityName = c => c + ' (' + (CITY[c] || '???') + ')';

// len = world length, pax = capacity; shape = fuselage half-width, wingspan, sweep, engines (in 42-unit local space)
const TYPES = {
  A320: { len: 34, pax: 150, fw: 2.3, span: 36, sweep: 10, eng: 2 }, B737: { len: 34, pax: 165, fw: 2.3, span: 35, sweep: 9, eng: 2 },
  A321: { len: 40, pax: 200, fw: 2.3, span: 36, sweep: 10, eng: 2 }, A330: { len: 42, pax: 260, fw: 2.8, span: 44, sweep: 13, eng: 2 },
  B787: { len: 44, pax: 240, fw: 2.8, span: 46, sweep: 12, eng: 2 }, B777: { len: 50, pax: 350, fw: 3.0, span: 45, sweep: 12, eng: 2 },
  A380: { len: 62, pax: 520, fw: 3.6, span: 46, sweep: 14, eng: 4 }
};

const AIRPORTS = {
  CAI: { temp: 27, name: 'Cairo International', city: 'Cairo', tower: 'Cairo Tower', rx0: 330, rx1: 1270, gates: 4, unlock: 0,
    rwNames: [['05L', '23R'], ['05R', '23L']], air: ['EK', 'QR', 'TK', 'LH', 'MS', 'SV'], fleet: ['A320', 'A320', 'B737', 'A321', 'A330', 'B777'],
    wx: { clear: 6, rain: 1, fog: 1.5, storm: 0.7 }, rate: 1, pay: 1,
    cities: ['Dubai', 'Doha', 'Istanbul', 'Frankfurt', 'Riyadh', 'Jeddah', 'Amman', 'Paris', 'London'] },
  DXB: { temp: 34, name: 'Dubai International', city: 'Dubai', tower: 'Dubai Tower', rx0: 300, rx1: 1300, gates: 5, unlock: 15000,
    rwNames: [['12L', '30R'], ['12R', '30L']], air: ['EK', 'EK', 'QR', 'EY', 'TK', 'BA', 'LH'], fleet: ['A320', 'B777', 'B787', 'A330', 'A380', 'A380'],
    wx: { clear: 7, rain: 0.3, fog: 2, storm: 0.4 }, rate: 1.15, pay: 1.3,
    cities: ['Cairo', 'London', 'Mumbai', 'Doha', 'Singapore', 'Frankfurt', 'New York', 'Sydney'] },
  LHR: { temp: 12, name: 'London Heathrow', city: 'London', tower: 'Heathrow Tower', rx0: 390, rx1: 1210, gates: 5, unlock: 40000,
    rwNames: [['09L', '27R'], ['09R', '27L']], air: ['BA', 'BA', 'LH', 'EK', 'QR', 'AF', 'TK'], fleet: ['A320', 'A321', 'B787', 'B777', 'A380', 'A330'],
    wx: { clear: 2, rain: 4, fog: 3, storm: 1 }, rate: 1.3, pay: 1.5,
    cities: ['Cairo', 'Dubai', 'Paris', 'New York', 'Doha', 'Istanbul', 'Frankfurt', 'Delhi'] },
  JFK: { temp: 15, name: 'John F. Kennedy', city: 'New York', tower: 'Kennedy Tower', rx0: 340, rx1: 1260, gates: 6, unlock: 80000,
    rwNames: [['04L', '22R'], ['04R', '22L']], air: ['AA', 'DL', 'BA', 'EK', 'LH', 'QR', 'TK'], fleet: ['B737', 'A321', 'B787', 'B777', 'A330', 'A380'],
    wx: { clear: 3, rain: 2, fog: 1, storm: 3 }, rate: 1.5, pay: 1.8,
    cities: ['London', 'Cairo', 'Dubai', 'Los Angeles', 'Doha', 'Frankfurt', 'Istanbul', 'Chicago'] }
};

const DIFF = { easy: { arr: 26, em: 140, emT: 95 }, normal: { arr: 18, em: 100, emT: 70 }, hard: { arr: 12, em: 70, emT: 55 } };

const GATE_X = Array.from({ length: 10 }, (_, i) => 400 + i * 90);
const GATE_ORDER = [4, 5, 3, 6, 2, 7, 1, 8, 0, 9];
const RW_Y = [150, 450];
const FS = { x: 1500, y: 300 };

// Build the airport ground graph. nOpen = number of open gates.
function buildAirport(cfg, nOpen) {
  const N = {};
  const add = (id, x, y) => (N[id] = { id, x, y, adj: [] });
  const link = (a, b) => { N[a].adj.push(b); N[b].adj.push(a); };
  const e1 = cfg.rx0 + 330, e2 = cfg.rx1 - 330;
  const rw = RW_Y.map((y, i) => {
    const ids = ['0', 'a', 'b', '1'].map(s => 'R' + i + s);
    [cfg.rx0, e1, e2, cfg.rx1].forEach((x, k) => add(ids[k], x, y));
    for (let k = 0; k < 3; k++) link(ids[k], ids[k + 1]);
    return { i, y, x0: cfg.rx0, x1: cfg.rx1, names: cfg.rwNames[i] };
  });
  // Taxiway A (y=300) between runways, ending at fire station
  add('Aa', e1, 300); add('Am', 800, 300); add('Ab', e2, 300); add('Ae', 1420, 300); add('FS', FS.x, FS.y);
  link('Aa', 'Am'); link('Am', 'Ab'); link('Ab', 'Ae'); link('Ae', 'FS');
  link('R0a', 'Aa'); link('R0b', 'Ab'); link('R1a', 'Aa'); link('R1b', 'Ab');
  // Taxiway B (y=560) apron, reached across runway 2
  add('Ba', e1, 560); add('Bb', e2, 560); link('R1a', 'Ba'); link('R1b', 'Bb');
  const bx = [['Ba', e1], ['Bb', e2]];
  const gates = GATE_X.map((x, i) => ({ i, x, y: 690, open: false, node: 'G' + i }));
  GATE_ORDER.slice(0, nOpen).forEach(i => gates[i].open = true);
  gates.forEach(g => { if (g.open) { add('Bg' + g.i, g.x, 560); bx.push(['Bg' + g.i, g.x]); add(g.node, g.x, g.y); link('Bg' + g.i, g.node); } });
  bx.sort((a, b) => a[1] - b[1]);
  for (let k = 0; k < bx.length - 1; k++) link(bx[k][0], bx[k + 1][0]);
  return { N, rw, gates, e1, e2 };
}

// ---- Translations (UI only; radio is always English) ----
const I18N = {
  en: {
    title: 'TAXIWAY ALPHA', tag: 'Air traffic control & airport manager', cont: 'Continue', newg: 'New game', airport: 'Airport', diff: 'Difficulty',
    easy: 'Easy', normal: 'Normal', hard: 'Hard', lang: 'Language', locked: 'Earn $%s lifetime', resume: 'Resume', settings: 'Settings',
    satLabel: 'Passenger Satisfaction', arrivals: 'Arrivals', departures: 'Departures', flight: 'Flight', fromto: 'From/To', aircraft: 'Aircraft', status: 'Status',
    eta: 'ETA/ETD', from: 'From', to: 'To', alt: 'Altitude', speed: 'Speed',
    land: 'Land', hold: 'Hold', go: 'Resume', gate: 'Gate', takeoff: 'Takeoff', shop: 'Upgrades', sound: 'Sound', on: 'On', off: 'Off',
    up_rw: 'Runways', up_rw_d: 'Faster braking & takeoff', up_term: 'Terminals', up_term_d: '+2 gates', up_gs: 'Ground services', up_gs_d: 'Faster turnaround, happier crowds',
    buy: 'Buy', max: 'MAX', lvl: 'Lv', close: 'Close', collision: 'Collision Alert', accident: 'Accident', over: 'ACCIDENT', flights: 'Flights handled', earned: 'Earned',
    retry: 'Play again', rotate: 'Rotate your device to landscape', hint: 'Drag to look around · scroll / pinch to zoom · tap a monitor to zoom in, tap again to go back · tap a plane to select it, then use the AIRCRAFT screen buttons',
    clear: 'Clear', rain: 'Rain', fog: 'Fog', storm: 'Storm', mayday: 'EMERGENCY', paused: 'PAUSED', ground: 'Ground',
    lyr_labels: 'Flight labels', lyr_shadows: 'Shadows', lyr_routes: 'Taxi routes', lyr_weather: 'Weather effects', lyr_lights: 'Lights', layers: 'Layers',
    s_approach: 'Approach', s_holding: 'Holding', s_landing: 'Landing', s_landed: 'Landed', s_taxiing: 'Taxiing', s_waiting: 'Waiting', s_gate: 'At gate',
    s_boarding: 'Boarding', s_ready: 'On Time', s_lineup: 'Lined up', s_takeoff: 'Takeoff', s_departed: 'Departed', s_accident: 'Accident', s_emergency: 'Emergency', s_climb: 'Climbing',
    kt: 'kt', ft: 'ft', back: 'Back'
  },
  ar: {
    title: 'تاكسي واي ألفا', tag: 'مراقبة الحركة الجوية وإدارة المطار', cont: 'متابعة', newg: 'لعبة جديدة', airport: 'المطار', diff: 'الصعوبة',
    easy: 'سهل', normal: 'عادي', hard: 'صعب', lang: 'اللغة', locked: 'اكسب %s$ إجمالاً', resume: 'استئناف', settings: 'الإعدادات',
    satLabel: 'رضا الركاب', arrivals: 'الوصول', departures: 'المغادرة', flight: 'الرحلة', fromto: 'من/إلى', aircraft: 'الطائرة', status: 'الحالة',
    eta: 'الوقت', from: 'من', to: 'إلى', alt: 'الارتفاع', speed: 'السرعة',
    land: 'هبوط', hold: 'انتظار', go: 'متابعة', gate: 'البوابة', takeoff: 'إقلاع', shop: 'التطوير', sound: 'الصوت', on: 'تشغيل', off: 'إيقاف',
    up_rw: 'المدارج', up_rw_d: 'كبح وإقلاع أسرع', up_term: 'الصالات', up_term_d: '+٢ بوابات', up_gs: 'الخدمات الأرضية', up_gs_d: 'تجهيز أسرع وركاب أسعد',
    buy: 'شراء', max: 'الأقصى', lvl: 'م', close: 'إغلاق', collision: 'تحذير تصادم', accident: 'حادث', over: 'حادث', flights: 'الرحلات', earned: 'الأرباح',
    retry: 'العب مجدداً', rotate: 'أدر جهازك إلى الوضع الأفقي', hint: 'اسحب للنظر حولك · قرّب بإصبعين · المس شاشة للتكبير وأعد المس للرجوع · المس طائرة لتحديدها ثم استخدم أزرار شاشة الطائرة',
    clear: 'صافٍ', rain: 'مطر', fog: 'ضباب', storm: 'عاصفة', mayday: 'طوارئ', paused: 'إيقاف مؤقت', ground: 'أرض',
    lyr_labels: 'بطاقات الرحلات', lyr_shadows: 'الظلال', lyr_routes: 'مسارات التاكسي', lyr_weather: 'مؤثرات الطقس', lyr_lights: 'الإضاءة', layers: 'الطبقات',
    s_approach: 'اقتراب', s_holding: 'انتظار', s_landing: 'هبوط', s_landed: 'هبطت', s_taxiing: 'تاكسي', s_waiting: 'متوقفة', s_gate: 'عند البوابة',
    s_boarding: 'صعود الركاب', s_ready: 'في الموعد', s_lineup: 'على المدرج', s_takeoff: 'إقلاع', s_departed: 'غادرت', s_accident: 'حادث', s_emergency: 'طوارئ', s_climb: 'صعود',
    kt: 'عقدة', ft: 'قدم', back: 'رجوع'
  }
};
const AP_NAMES_AR = { CAI: 'القاهرة', DXB: 'دبي', LHR: 'هيثرو', JFK: 'كينيدي' };

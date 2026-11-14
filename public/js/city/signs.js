// Bangkok street-sign, shop, billboard, and Expressway / Motorway (EXAT / Motorway 7) vocabulary.
export const SHOP_SIGNS = [
  'ก๋วยเตี๋ยวเรือ', 'ข้าวแกงปักษ์ใต้', 'หมูกระทะบุฟเฟ่ต์', 'ข้าวมันไก่ตอน', 'ส้มตำไก่ย่าง',
  'คาเฟ่ กาแฟสด', 'ชานมไข่มุก', 'ร้านขายยา', 'คลินิกทันตกรรม', 'นวดแผนไทย',
  'ร้านยางรถยนต์', 'อู่ซ่อมรถ-จูนกล่อง', 'ประดับยนต์ ฟิล์ม', 'ล้างอัดฉีด 24ชม.', 'ข้าวต้มโต้รุ่ง',
  'ผัดไทย-หอยทอด', 'ชาบู หม้อไฟ', 'เบเกอรี่ โฮมเมด', 'ร้านแว่นตา', 'ซักอบรีด 24ชม.',
  'อะไหล่ซิ่ง เทอร์โบ', 'ตั้งศูนย์-ถ่วงล้อ', 'คลินิกความงาม', 'ร้านหนังสือ', 'มินิมาร์ท',
];

export const VERTICAL_SIGNS = [
  'ก๋วยเตี๋ยว', 'หมูกระทะ', 'ร้านยาง', 'อู่ซ่อมรถ', 'คาราโอเกะ', 'โรงแรม',
  'คลินิก', 'นวดไทย', 'คาเฟ่', 'ประดับยนต์', 'ข้าวต้ม', '24 ชั่วโมง',
];

export const ROAD_TEXT = ['หยุด', 'ชะลอ'];
export const PLACE_NAMES = ['สยาม-อโศก', 'พระราม 9', 'ท่าเรือคลองเตย', 'ทางด่วนศรีรัช', 'ลาดพร้าว', 'ด่านดินแดง'];
export const KONBINI = { name: 'มินิมาร์ท 24 ชม.', sub: '7-FRESH MART · OPEN 24H' };
export const STATION = { name: 'สถานีสยาม · อโศก', sub: 'BTS SKYTRAIN STATION' };
export const JP_FONT = '"Kanit", "Noto Sans Thai", sans-serif';

// Authentic Bangkok Expressway (EXAT blue #003f87) & Motorway 7 (green #006b3f) overhead gantry signs
export const EXPRESSWAY_GANTRIES = [
  {
    bg: '#003f87',
    badge: 'ทางพิเศษเฉลิมมหานคร',
    left: { th: 'ดินแดง · แจ้งวัฒนะ', en: 'DIN DAENG · CHAENG WATTHANA', arrow: '↑' },
    mid: { th: 'พระราม 9 · รามอินทรา', en: 'RAMA IX · RAM INTHRA', arrow: '↑' },
    right: { th: 'สุขุมวิท · อโศก', en: 'SUKHUMVIT · ASOK', sub: 'ทางออก 500 ม.', arrow: '↗', exit: true },
    speed: '90',
  },
  {
    bg: '#006b3f',
    badge: 'ทางหลวงพิเศษหมายเลข 7 (MOTORWAY)',
    left: { th: 'สุวรรณภูมิ ✈', en: 'SUVARNABHUMI AIRPORT', arrow: '↑' },
    mid: { th: 'ชลบุรี · พัทยา', en: 'CHON BURI · PATTAYA', arrow: '↑' },
    right: { th: 'ศรีนครินทร์ · บางนา', en: 'SRINAKARIN · BANG NA', sub: 'ทางออก 300 ม.', arrow: '↗', exit: true },
    speed: '120',
  },
  {
    bg: '#003f87',
    badge: 'ทางพิเศษศรีรัช',
    left: { th: 'ดาวคะนอง · พระราม 2', en: 'DAO KHANONG · RAMA II', arrow: '↑' },
    mid: { th: 'สาทร · สีลม', en: 'SATHON · SILOM', arrow: '↑' },
    right: { th: 'สระบุรี · เขาใหญ่', en: 'SARABURI · KHAO YAI', sub: 'ทางแยกต่างระดับ', arrow: '↖', exit: true },
    speed: '90',
  },
  {
    bg: '#003f87',
    badge: 'ทางพิเศษเฉลิมมหานคร',
    left: { th: 'บางนา · สมุทรปราการ', en: 'BANG NA · SAMUT PRAKAN', arrow: '↑' },
    mid: { th: 'พระราม 3 · คลองเตย', en: 'RAMA III · KHLONG TOEI', arrow: '↑' },
    right: { th: 'ท่าเรือคลองเตย', en: 'KHLONG TOEI PORT', sub: 'ชิดซ้าย 400 ม.', arrow: '↖', exit: true },
    speed: '80',
  },
];

// Large Bangkok Expressway unipole billboards
export const BILLBOARDS = [
  { bg1: '#0a1931', bg2: '#185adb', accent: '#ffc947', tag: 'ULTRA PERFORMANCE TIRE', title: 'NITTO · TOYO PROXES', sub: 'เกาะถนนหนึบทุกโค้ง ทางด่วน-เขาใหญ่' },
  { bg1: '#1b4332', bg2: '#2d6a4f', accent: '#74c69d', tag: 'NEW CONDOMINIUM', title: 'THE LINE พระราม 9 - อโศก', sub: 'ติดทางด่วนศรีรัช & BTS เริ่ม 2.89 ล้าน*' },
  { bg1: '#3c096c', bg2: '#7b2cbf', accent: '#ff9e00', tag: '5G MAX SPEED NETWORK', title: 'SUPER 5G เร็วแรงทั่วไทย', sub: 'สัญญาณเต็มทุกเส้นทาง กรุงเทพฯ - มอเตอร์เวย์' },
  { bg1: '#7f1d1d', bg2: '#dc2626', accent: '#fef08a', tag: '100% FULLY SYNTHETIC', title: 'RACING OIL 5W-40', sub: 'ปกป้องเครื่องยนต์รอบจัด แรงม้าไม่ตก' },
  { bg1: '#003049', bg2: '#005f73', accent: '#94d2bd', tag: 'EXAT · DEPARTMENT OF HIGHWAYS', title: 'M-FLOW & EASY PASS', sub: 'วิ่งผ่านด่านคล่องตัว ไม่ต้องหยุดชะลอหน้าด่าน' },
  { bg1: '#111827', bg2: '#374151', accent: '#38bdf8', tag: 'BANGKOK AUTO SALON', title: 'VIOS STREET TUNING', sub: 'รวมพลคนรักรถซิ่ง ทางด่วนกรุงเทพฯ คืนนี้' },
];

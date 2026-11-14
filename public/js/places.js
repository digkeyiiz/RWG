// Garages / workshops on the Bangkok map — shared by client and server (server checks you are really there).
// hidden: not on the minimap until discovered; discovering one pays a bonus once.
export const GARAGES = [
  { id: 'home', name: 'เซฟเฮาส์ (ลาดพร้าว)', desc: 'จุดเกิด · แต่งรถ · เปลี่ยนคัน', x: -200, y: 0, z: 157.6, hidden: false },
  { id: 'station', name: 'อู่สยาม-อโศก (ใต้ BTS)', desc: 'อู่แต่งเครื่องใจกลางกรุงเทพฯ', x: 6, y: 0, z: 29.6, hidden: false },
  { id: 'touge', name: 'อู่ตีนเขาใหญ่', desc: 'ช่างจูนสายขึ้นเขา', x: -520, y: 0, z: 0, hidden: false },
  { id: 'harbor', name: 'โกดังลับท่าเรือคลองเตย', desc: 'อู่ลับ · ของแต่งนำเข้าหายาก', x: 470, y: 0, z: 20, hidden: true },
  { id: 'summit', name: 'อู่ลับยอดเขาใหญ่', desc: 'อู่ลับบนจุดชมวิวยอดเขา', x: -1460, y: 63, z: -20, hidden: true, onTouge: true },
  { id: 'underpass', name: 'ลานจอดใต้ทางด่วนดินแดง', desc: 'จุดนัดพบสายซิ่งทางด่วน · อู่ลับ', x: 352, y: 0, z: -150, hidden: true },
];
export const GARAGE_RADIUS = 9;
export const garageById = (id) => GARAGES.find((g) => g.id === id);

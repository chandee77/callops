const { pool } = require('./db');

// --- 1. LOCAL TIMEZONE FIX ---
// Safely converts a Date object back to 'YYYY-MM-DD' for MySQL
const formatForDB = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// --- 2. COLD START RANDOMIZER ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// --- 3. CORE ALGORITHM ---
async function assignShift(targetDate, shiftType) {
  const dateStr = formatForDB(targetDate); // USING THE NEW FUNCTION HERE
  const dayOfWeek = targetDate.getDay();

  // 1. Check if it's a holiday or weekend (0 = Sunday, 6 = Saturday)
  const [holidays] = await pool.query('SELECT * FROM Holiday WHERE date = ? LIMIT 1', [dateStr]);
  if (holidays.length > 0 || dayOfWeek === 0 || dayOfWeek === 6) {
    console.log(`Skipping ${dateStr}: Holiday or Weekend.`);
    return null; 
  }
  
  // 2 & 3. Fetch Available Users (The Power of Raw SQL)
  // This single query gets active users who are NOT on leave and NOT already working today.
  const [availableUsers] = await pool.query(`
    SELECT u.* FROM User u
    WHERE u.isActive = 1
    AND NOT EXISTS (
      SELECT 1 FROM Unavailability un 
      WHERE un.userId = u.id AND un.date = ? AND un.shiftType IN (?, 'ALL_DAY')
    )
    AND NOT EXISTS (
      SELECT 1 FROM Roster r 
      WHERE r.userId = u.id AND r.date = ?
    )
  `, [dateStr, shiftType, dateStr]);

  if (availableUsers.length === 0) {
    throw new Error('CRITICAL: No available officers for this shift!');
  }

  // 4. The Sorting Magic (Includes Cold Start Randomizer)
  availableUsers.sort((a, b) => a.totalShifts - b.totalShifts);
  const lowestShiftCount = availableUsers[0].totalShifts;
  const tiedCandidates = availableUsers.filter(u => u.totalShifts === lowestShiftCount);
  const shuffledCandidates = shuffleArray(tiedCandidates);
  const assignedUser = shuffledCandidates[0];

  // 5. Save to Roster and Update Metrics
  const [rosterResult] = await pool.query(
    'INSERT INTO Roster (date, shiftType, userId) VALUES (?, ?, ?)',
    [dateStr, shiftType, assignedUser.id]
  );

  // MySQL uses standard datetime formats for DATETIME columns
  const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await pool.query(
    'UPDATE User SET totalShifts = totalShifts + 1, lastShiftDate = ? WHERE id = ?',
    [nowStr, assignedUser.id]
  );

  return {
    id: rosterResult.insertId,
    date: targetDate,
    shiftType: shiftType,
    userId: assignedUser.id
  };
}

module.exports = { assignShift };
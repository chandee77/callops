require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { pool, testDbConnection } = require('./db');
const { assignShift } = require('./scheduler');

const app = express();

// --- 1. DATE HELPERS (LOCAL TIMEZONE SAFE) ---

// Safely converts 'YYYY-MM-DD' from the HTML form into a local Date object
const parseLocal = (dateString) => {
    const [year, month, day] = dateString.split('-');
    return new Date(year, parseInt(month, 10) - 1, day);
};

// Safely converts a Date object back to 'YYYY-MM-DD' for MySQL
const formatForDB = (dateObj) => {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

// --- 2. MIDDLEWARE & SESSIONS ---
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.json({ limit: '10kb' }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

const requireAdmin = (req, res, next) => {
    if (req.session && req.session.role === 'admin') return next();
    res.redirect('/login');
};
// Allows BOTH Admin and OIC to use the route
const requireManager = (req, res, next) => {
    if (req.session && (req.session.role === 'admin' || req.session.role === 'oic')) return next();
    res.redirect('/login');
};
const requireAuth = (req, res, next) => {
    if (req.session && req.session.role) return next();
    res.redirect('/login');
};

// Helper function to fetch dashboard data
// --- CENTRAL DATA FETCHER & CALENDAR MATH ---
async function getDashboardData(targetMonthQuery) {
    // 1. Determine which month to show (defaults to current month)
    const targetMonth = targetMonthQuery || formatForDB(new Date()).substring(0, 7);
    const [yearStr, monthStr] = targetMonth.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // JS months are 0-indexed

    // 2. Fetch Users
    const [users] = await pool.query('SELECT * FROM User ORDER BY totalShifts ASC');
    
    // 3. Fetch only shifts and holidays for THIS specific month
    const [rosterRaw] = await pool.query('SELECT * FROM Roster WHERE date LIKE ?', [`${targetMonth}-%`]);
    const [holidaysRaw] = await pool.query('SELECT * FROM Holiday WHERE date LIKE ?', [`${targetMonth}-%`]);

    // 4. Format Maps for the UI
    const scheduleMap = {};
    rosterRaw.forEach(shift => {
        const d = formatForDB(shift.date);
        if (!scheduleMap[d]) scheduleMap[d] = { MORNING: null, AFTERNOON: null };
        scheduleMap[d][shift.shiftType] = shift.userId;
    });

    const holidayMap = {};
    holidaysRaw.forEach(h => {
        holidayMap[formatForDB(h.date)] = h.name;
    });

    // 5. Calendar Grid Math
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon
    const monthName = new Date(year, month, 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    // Calculate Next/Prev months for the UI buttons
    const prevMonthDate = new Date(year, month - 1, 1);
    const nextMonthDate = new Date(year, month + 1, 1);

    return { 
        users, 
        scheduleMap, 
        holidayMap, 
        daysInMonth, 
        firstDayOfWeek, 
        year, 
        monthStr, 
        monthName,
        prevMonth: `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`,
        nextMonth: `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`
    };
}

// --- 2. PUBLIC ROUTES ---

// --- PUBLIC DASHBOARD (CALENDAR VIEW) ---

// Login Page
app.get('/login', (req, res) => {
    // If they are already logged in, send them straight to their dashboard
    if (req.session.role === 'admin') return res.redirect('/admin');
    if (req.session.role === 'oic') return res.redirect('/oic');
    if (req.session.role === 'staff') return res.redirect('/');
    
    res.render('login', { error: null });
});

// Process Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    
    if (username === process.env.ADMIN_USER && password === process.env.ADMIN_PASS) {
        req.session.role = 'admin';
        return res.redirect('/admin');
    } 
    
    if (username === process.env.OIC_USER && password === process.env.OIC_PASS) {
        req.session.role = 'oic';
        return res.redirect('/oic');
    }

    if (username === process.env.STAFF_USER && password === process.env.STAFF_PASS) {
        req.session.role = 'staff';
        return res.redirect('/'); // Staff goes to the public calendar
    }
    
    res.render('login', { error: 'Invalid username or password.' });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login'); 
});


// --- 3. PROTECTED ADMIN ROUTES ---
app.get('/', requireAuth, async (req, res, next) => {
    try {
        const data = await getDashboardData(req.query.month);
        res.render('dashboard', data);
    } catch (error) {
        next(error);
    }
});
// Admin Dashboard (Shows forms)
app.get('/admin', requireAdmin, async (req, res, next) => {
    try {
        const data = await getDashboardData(req.query.month);
        res.render('admin', data);
    } catch (error) {
        next(error);
    }
});

app.get('/oic', requireManager, async (req, res, next) => {
    try {
        const data = await getDashboardData(req.query.month);
        res.render('oic', data);
    } catch (error) {
        next(error);
    }
});

app.post('/api/unavailability', requireAdmin, async (req, res, next) => {
    try {
        const { userId, date, reason } = req.body; // Reason can be LEAVE or ADMIN_LOCK
        const targetDate = new Date(date);
        const dateStr = formatForDB(targetDate);

        await pool.query(
            'INSERT INTO Unavailability (userId, date, shiftType, reason) VALUES (?, ?, ?, ?)',
            [userId, dateStr, 'ALL_DAY', reason || 'LEAVE']
        );

        const [existingShifts] = await pool.query("SELECT * FROM Roster WHERE userId = ? AND date = ? LIMIT 1", [userId, dateStr]);

        if (existingShifts.length > 0) {
            const existingShift = existingShifts[0];
            await pool.query('DELETE FROM Roster WHERE id = ?', [existingShift.id]);
            await pool.query('UPDATE User SET totalShifts = GREATEST(totalShifts - 1, 0) WHERE id = ?', [userId]);
            await assignShift(targetDate, existingShift.shiftType);
        }
        res.redirect('/admin'); 
    } catch (error) { next(error); }
});

app.post('/api/holidays', requireAdmin, async (req, res, next) => {
    try {
        const { date, name } = req.body;
        const targetDate = new Date(date);
        const dateStr = formatForDB(targetDate);

        await pool.query('INSERT INTO Holiday (date, name) VALUES (?, ?)', [dateStr, name]);
        const [shiftsToCancel] = await pool.query('SELECT * FROM Roster WHERE date = ?', [dateStr]);

        for (const shift of shiftsToCancel) {
            await pool.query('DELETE FROM Roster WHERE id = ?', [shift.id]);
            await pool.query('UPDATE User SET totalShifts = GREATEST(totalShifts - 1, 0) WHERE id = ?', [shift.userId]);
        }
        res.redirect('/admin');
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).send(`<h1>Error: Holiday exists</h1><a href="/admin">Back</a>`);
        next(error);
    }
});

app.post('/api/users', requireAdmin, async (req, res, next) => {
    try {
        const { id, name } = req.body;
        await pool.query('INSERT INTO User (id, name) VALUES (?, ?)', [id, name]);
        res.redirect('/admin');
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(400).send(`<h1>Error: User exists</h1><a href="/admin">Back</a>`);
        next(error);
    }
});

app.post('/api/generate-roster', requireAdmin, async (req, res, next) => {
    try {
        const targetDate = new Date(req.body.date);
        
        
        // --- NEW: WEEKEND BLOCKER ---
        const dayOfWeek = targetDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) { // 0 is Sunday, 6 is Saturday
            return res.status(400).send(`
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                    <h1>🛑 Weekends are automatically off!</h1>
                    <p>You cannot generate a schedule for Saturday or Sunday.</p>
                    <a href="/admin" style="color: blue; text-decoration: none;">← Go Back</a>
                </div>
            `);
        }

        const dateStr = formatForDB(targetDate);
        const [existing] = await pool.query('SELECT * FROM Roster WHERE date = ?', [dateStr]);
        
        if (existing.length > 0) {
            return res.status(400).send(`<h1>Error: Shifts exist</h1><a href="/admin">Back</a>`);
        }

        await assignShift(targetDate, 'MORNING');
        await assignShift(targetDate, 'AFTERNOON');
        res.redirect('/admin');
    } catch (error) { 
        next(error); 
    }
});

// --- 6. MANAGER GENERATES A FULL MONTH (Admin & OIC) ---
app.post('/api/generate-month', requireManager, async (req, res, next) => {
    try {
        const { monthYear } = req.body; 
        if (!monthYear) throw new Error("Missing month/year selection.");

        const [yearStr, monthStr] = monthYear.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10); 
        
        const daysInMonth = new Date(year, month, 0).getDate();
        
        for (let day = 1; day <= daysInMonth; day++) {
            const targetDate = new Date(year, month - 1, day);
            const dateStr = formatForDB(targetDate);
            const dayOfWeek = targetDate.getDay();

            // 1. Skip Weekends automatically (0 = Sunday, 6 = Saturday)
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            // 2. Skip Holidays automatically
            const [holidays] = await pool.query('SELECT * FROM Holiday WHERE date = ?', [dateStr]);
            if (holidays.length > 0) continue;

            // 3. Fill Morning if empty
            const [existingMorning] = await pool.query("SELECT * FROM Roster WHERE date = ? AND shiftType = 'MORNING'", [dateStr]);
            if (existingMorning.length === 0) {
                await assignShift(targetDate, 'MORNING');
            }

            // 4. Fill Afternoon if empty
            const [existingAfternoon] = await pool.query("SELECT * FROM Roster WHERE date = ? AND shiftType = 'AFTERNOON'", [dateStr]);
            if (existingAfternoon.length === 0) {
                await assignShift(targetDate, 'AFTERNOON');
            }
        }

        // 👉 DYNAMIC REDIRECT: Send them back to the exact dashboard they came from
        if (req.session.role === 'admin') {
            res.redirect('/admin');
        } else {
            res.redirect('/oic');
        }
        
    } catch (error) {
        next(error);
    }
});

// --- 7. ADMIN REMOVES (DEACTIVATES) A USER ---
app.post('/api/users/remove', requireAdmin, async (req, res, next) => {
    try {
        const { userId } = req.body;
        if (!userId) throw new Error("Missing User ID.");

        // 1. Soft delete: They are no longer active, but historical records remain intact.
        await pool.query('UPDATE User SET isActive = 0 WHERE id = ?', [userId]);

        // 2. Wipe them from any FUTURE shifts they were scheduled for
        const today = formatForDB(new Date());
        const [futureShifts] = await pool.query('SELECT * FROM Roster WHERE userId = ? AND date >= ?', [userId, today]);
        
        for (const shift of futureShifts) {
            await pool.query('DELETE FROM Roster WHERE id = ?', [shift.id]);
        }

        // Note: You can now optionally run the generation tool to fill the holes this created.
        res.redirect('/admin');
    } catch (error) {
        next(error);
    }
});

// --- 8. ADMIN CLEARS FUTURE SCHEDULE (RECALCULATE PREP) ---
app.post('/api/clear-future', requireAdmin, async (req, res, next) => {
    try {
        const { fromDate } = req.body;
        const targetDateStr = formatForDB(parseLocal(fromDate));

        // Find shifts from this date onward
        const [shiftsToClear] = await pool.query('SELECT * FROM Roster WHERE date >= ?', [targetDateStr]);

        // Delete them and refund the shift counts to keep fairness intact
        for (const shift of shiftsToClear) {
            await pool.query('DELETE FROM Roster WHERE id = ?', [shift.id]);
            await pool.query('UPDATE User SET totalShifts = GREATEST(totalShifts - 1, 0) WHERE id = ?', [shift.userId]);
        }

        res.redirect('/admin');
    } catch (error) {
        next(error);
    }
});

// --- 9. ADMIN HARD RESETS THE ENTIRE SYSTEM ---
app.post('/api/reset-system', requireAdmin, async (req, res, next) => {
    try {
        // 1. Delete all shifts completely
        await pool.query('DELETE FROM Roster');
        
        // 2. Delete all reported unavailabilities/leaves
        await pool.query('DELETE FROM Unavailability');
        
        // 3. Reset all user shift counts to zero
        await pool.query('UPDATE User SET totalShifts = 0, lastShiftDate = NULL');

        res.redirect('/admin');
    } catch (error) {
        next(error);
    }
});

// --- 4. ERROR & BOOT (Same as before) ---
app.use((err, req, res, next) => {
    console.error(`[ERROR] ${req.method} ${req.url} - ${err.message}`);
    res.status(500).send(`<h1>System Error</h1><p>${err.message}</p><a href="/">Return Home</a>`);
});

const PORT = process.env.PORT || 3000;
let server;
testDbConnection().then(() => {
    server = app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
});
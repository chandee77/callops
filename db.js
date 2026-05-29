const mysql = require('mysql2/promise');
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, 
    // host: 'localhost',
    // user: 'root',
    // password: '',
    // database: 'callops', 
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// A utility function to test the connection on startup
async function testDbConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ MySQL Database connected successfully.');
        connection.release(); // Always release it back to the pool
    } catch (error) {
        console.error('❌ FATAL: Failed to connect to MySQL.');
        console.error(error.message);
        process.exit(1); // Kill the app if DB is down. No DB = No App.
    }
}

module.exports = { pool, testDbConnection };
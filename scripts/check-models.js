import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_mcp_gateway',
});

async function checkModels() {
    try {
        const result = await pool.query(`
            SELECT id, provider, api_model_name, layer, enabled, priority 
            FROM model_configs 
            ORDER BY layer, priority
        `);
        
        console.log('Models in database:');
        result.rows.forEach(row => {
            console.log(`- ${row.id} (${row.layer}) - enabled: ${row.enabled}, priority: ${row.priority}`);
        });
    } catch (error) {
        console.error('Error:', error.message);
    } finally {
        await pool.end();
    }
}

checkModels();
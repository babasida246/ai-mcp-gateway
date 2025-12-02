require('dotenv').config();
const axios = require('axios');

async function checkOpenRouterApiKey() {
    try {
        // Try to fetch available models as a quick API key check
        const response = await axios.get('https://openrouter.ai/api/v1/models', {
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'HTTP-Referer': 'https://github.com/babasida246/ai-mcp-gateway',
                'X-Title': 'ai-mcp-gateway-test'
            }
        });
        console.log('✅ API key hợp lệ. Danh sách models:', response.data.models ? response.data.models.map(m => m.id) : response.data);
        return true;
    } catch (err) {
        console.error('❌ API key không hợp lệ hoặc không kết nối được OpenRouter:', err.response ? err.response.data : err.message);
        return false;
    }
}

async function checkLlama3Model() {
    try {
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: 'meta-llama/llama-3.3-70b-instruct:free',
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Nêu 3 đặc điểm nổi bật của mô hình Llama 3.3-70B.' }
            ],
            max_tokens: 64
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://github.com/babasida246/ai-mcp-gateway',
                'X-Title': 'ai-mcp-gateway-test'
            }
        });
        console.log('✅ Model meta-llama/llama-3.3-70b-instruct:free trả về:', response.data);
    } catch (err) {
        console.error('❌ Không gọi được model meta-llama/llama-3.3-70b-instruct:free:', err.response ? err.response.data : err.message);
    }
}

(async () => {
    const ok = await checkOpenRouterApiKey();
    if (ok) {
        await checkLlama3Model();
    }
})();

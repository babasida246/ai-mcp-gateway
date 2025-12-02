require('dotenv').config();
const axios = require('axios');

async function testLlama3Model() {
    try {
        const response = await axios.post('http://localhost:3000/v1/completions', {
            model: 'meta-llama/llama-3.3-70b-instruct:free',
            messages: [
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'Nêu 3 đặc điểm nổi bật của mô hình Llama 3.3-70B.' }
            ],
            max_tokens: 64
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });
        console.log('Model response:', response.data);
    } catch (err) {
        console.error('Error calling model:', err.response ? err.response.data : err.message);
    }
}

testLlama3Model();

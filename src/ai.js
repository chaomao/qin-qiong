const marked = require('marked');
const axios = require('axios');

const messagesPool = [
  { role: 'system', content: 'you are a software engineer expert focus on analyze and fix coding issues' }
];
async function getAIResponse(userMessage) {
  const apiKey = 'openai-key';
  // const chat-glm-apiKey = 'chatglm-key';
  const userInput = { role: 'user', content: userMessage };
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    // 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    {
      model: 'gpt-3.5-turbo', // Use the appropriate model
      // model: 'glm-3-turbo', // Use the appropriate model
      messages: [...messagesPool, userInput],
    },
    {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  const assistantResponse = response.data.choices[0].message;
  messagesPool.push(userInput, assistantResponse);
  return marked.parse(assistantResponse.content);
}

module.exports = getAIResponse;
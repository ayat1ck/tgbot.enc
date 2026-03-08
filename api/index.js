const { Telegraf } = require('telegraf');
const axios = require('axios');

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const MY_TELEGRAM_ID = String(process.env.MY_TELEGRAM_ID || '');

const SYSTEM_PROMPT = 'Ты — краткий мобильный справочник. Отвечай только на фактологические вопросы (даты, определения, события). КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать код, решать задачи или писать эссе. Максимум 300 символов';

if (!TELEGRAM_BOT_TOKEN) {
  throw new Error('Missing TELEGRAM_BOT_TOKEN env variable');
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

if (process.env.LOCAL_TEST_MODE === '1') {
  bot.telegram.callApi = async (method, payload) => {
    console.log('[LOCAL_TEST_MODE] Telegram API call:', method, payload || {});
    if (method === 'getMe') {
      return { id: 0, is_bot: true, first_name: 'LocalTestBot', username: 'local_test_bot' };
    }
    return true;
  };
}

async function generateFactAnswer(question) {
  const apiKey = (process.env.GROQ_API_KEY || '').trim();
  const modelName = (process.env.GROQ_MODEL || 'llama-3.1-8b-instant').trim();

  if (!apiKey) {
    return 'Сервис ответа временно недоступен.';
  }

  if (process.env.LOCAL_TEST_MODE === '1') {
    return 'Локальный тестовый ответ.';
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: modelName,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Вопрос: ${question}\nОтветь на русском языке.` }
        ],
        temperature: 0.2,
        max_tokens: 180
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    const text = (response.data?.choices?.[0]?.message?.content || '').trim();
    return text.slice(0, 300) || 'Нет данных.';
  } catch (error) {
    const status = error.response?.status;
    console.error('Groq error:', status || error.message);
    if (status === 429) {
      return 'Превышен лимит запросов. Попробуйте позже.';
    }
    return 'Ошибка при получении ответа.';
  }
}

async function processInlineQuery(inlineQuery, answerInlineQuery) {
  const fromId = String(inlineQuery.from.id);

  if (!MY_TELEGRAM_ID || fromId !== MY_TELEGRAM_ID) {
    await answerInlineQuery([
      {
        type: 'article',
        id: 'restricted',
        title: 'Ограниченный доступ',
        input_message_content: {
          message_text: 'Доступ ограничен'
        },
        description: 'Только для владельца бота'
      }
    ], { cache_time: 1, is_personal: true });
    return;
  }

  const query = (inlineQuery.query || '').trim();
  if (!query) {
    await answerInlineQuery([], { cache_time: 1, is_personal: true });
    return;
  }

  const answer = await generateFactAnswer(query);
  await answerInlineQuery([
    {
      type: 'article',
      id: 'fact-answer',
      title: 'Ответ',
      input_message_content: {
        message_text: answer
      },
      description: answer
    }
  ], { cache_time: 1, is_personal: true });
}

bot.inlineQuery(async (ctx) => {
  try {
    await processInlineQuery(
      ctx.inlineQuery,
      (results, options) => ctx.answerInlineQuery(results, options)
    );
  } catch (error) {
    console.error('Inline query handler error:', error);
    try {
      await ctx.answerInlineQuery([
        {
          type: 'article',
          id: 'fallback-error',
          title: 'Ошибка',
          input_message_content: {
            message_text: 'Внутренняя ошибка сервиса.'
          }
        }
      ], { cache_time: 1, is_personal: true });
    } catch (innerError) {
      console.error('Inline fallback error:', innerError);
    }
  }
});

const webhookPath = '/api';
const webhookHandler = bot.webhookCallback(webhookPath);

async function handleUpdate(update) {
  await bot.handleUpdate(update);
}

async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ ok: true });
    return;
  }

  try {
    if (req.body) {
      await handleUpdate(req.body);
      res.status(200).json({ ok: true });
      return;
    }

    await webhookHandler(req, res);
  } catch (error) {
    console.error('Webhook error:', error);
    if (!res.headersSent) {
      res.status(500).json({ ok: false, error: 'Webhook processing failed' });
    }
  }
}

module.exports = handler;
module.exports.handleUpdate = handleUpdate;
module.exports.processInlineQuery = processInlineQuery;

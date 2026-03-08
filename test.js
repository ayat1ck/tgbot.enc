try {
  require('dotenv').config();
} catch (_) {
  // dotenv optional for local test
}

process.env.TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '123456:TEST_TOKEN';
process.env.MY_TELEGRAM_ID = process.env.MY_TELEGRAM_ID || '111111111';
process.env.LOCAL_TEST_MODE = '1';

const { processInlineQuery } = require('./api/index.js');

async function run() {
  const inlineQuery = {
    id: 'test_inline_query_id',
    from: { id: Number(process.env.MY_TELEGRAM_ID) },
    query: 'Что такое квантовая запутанность?'
  };

  try {
    console.log('Запуск локального теста inline_query...');
    await processInlineQuery(inlineQuery, async (results) => {
      console.log('Ответ бота (mock):');
      console.log(JSON.stringify(results, null, 2));
    });
    console.log('Тест завершен без исключений.');
  } catch (error) {
    console.error('Ошибка теста:', error);
    process.exitCode = 1;
  }
}

run();

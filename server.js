require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.TELEGRAM_BOT_TOKEN;
const openRouterKey = process.env.OPENROUTER_API_KEY;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not configured");
  process.exit(1);
}

if (!openRouterKey) {
  console.error("OPENROUTER_API_KEY is not configured");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const userStates = {};

bot.onText(/^\/start$/, async (msg) => {
  userStates[msg.chat.id] = {};

  await bot.sendMessage(
    msg.chat.id,
    "🏠 RealtorAI\n\nAI-анализ недвижимости.\n\nВыберите действие:",
    {
      reply_markup: {
        keyboard: [
          ["📊 Анализ объекта"],
          ["💰 Оценка цены"],
          ["💡 Что улучшить"],
          ["ℹ️ Как это работает"]
        ],
        resize_keyboard: true
      }
    }
  );
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text === "/start") return;

  const chatId = msg.chat.id;
  const text = msg.text;

  if (text === "ℹ️ Как это работает") {
    await bot.sendMessage(
      chatId,
      "RealtorAI анализирует объект недвижимости по вашим данным и даёт профессиональные рекомендации.\n\nНачнём с анализа объекта."
    );
    return;
  }

  if (
    text === "📊 Анализ объекта" ||
    text === "💰 Оценка цены" ||
    text === "💡 Что улучшить"
  ) {
    userStates[chatId] = {
      mode: text,
      step: "waiting_data"
    };

    await bot.sendMessage(
      chatId,
      "Отправьте данные об объекте одним сообщением.\n\nНапример:\n\n2-комнатная квартира, Москва\n52 м², 7 этаж из 17\nДом 2018 года\nЦена 14 500 000 ₽\nРемонт хороший\nМетро 10 минут пешком\nБалкон есть"
    );
    return;
  }

  if (userStates[chatId]?.step === "waiting_data") {
    const mode = userStates[chatId].mode;

    await bot.sendMessage(
      chatId,
      "⏳ Анализирую объект..."
    );

    try {
      const prompt = `
Ты — профессиональный AI-аналитик недвижимости RealtorAI.

Проанализируй объект на основе ТОЛЬКО предоставленных пользователем данных.
Не выдумывай характеристики, цены, расстояния, состояние дома или другие факты.

Режим анализа: ${mode}

Данные объекта:
${text}

Дай структурированный анализ:

1. Краткий вывод
2. Сильные стороны объекта
3. Слабые стороны объекта
4. Что может повлиять на цену
5. Риски и вопросы, которые нужно проверить
6. Что можно улучшить
7. Практические рекомендации

Если данных недостаточно для какого-либо вывода — прямо напиши, каких данных не хватает.

Не выдавай предположения за факты.
`;

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openRouterKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "openrouter/free",
            messages: [
              {
                role: "system",
                content:
                  "Ты точный аналитик недвижимости. Не выдумывай факты."
              },
              {
                role: "user",
                content: prompt
              }
            ]
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(errorText);
        throw new Error("OpenRouter request failed");
      }

      const data = await response.json();

      const result =
        data.choices?.[0]?.message?.content ||
        "Не удалось получить анализ.";

      await bot.sendMessage(chatId, result);

      userStates[chatId] = {};
    } catch (error) {
      console.error(error);

      await bot.sendMessage(
        chatId,
        "❌ Не удалось выполнить анализ. Попробуйте ещё раз."
      );
    }
  }
});

const app = express();

app.get("/", (req, res) => {
  res.send("RealtorAI bot is running");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`HTTP server is running on port ${PORT}`);
});

console.log("RealtorAI Telegram bot is running");

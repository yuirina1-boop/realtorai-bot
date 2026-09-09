```javascript
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

async function analyzeProperty(chatId, text, photoFileId = null) {
  await bot.sendMessage(chatId, "⏳ Анализирую объект...");

  try {
    let imageUrl = null;

    if (photoFileId) {
      console.log("Получаю ссылку на фото:", photoFileId);
      imageUrl = await bot.getFileLink(photoFileId);
      console.log("Ссылка на фото получена");
    }

    const prompt = `
Ты — профессиональный AI-аналитик недвижимости RealtorAI.

Проанализируй объект только на основании предоставленных данных.

ПРАВИЛА:
1. Не выдумывай факты.
2. Факты из текста пользователя считай подтвержденными.
3. По фотографии описывай только то, что действительно видно.
4. Не определяй по фотографии точную площадь, цену, адрес, этаж или год дома.
5. Не выдавай предположения за факты.
6. Если данных недостаточно — прямо укажи, чего не хватает.
7. Не создавай рекламный текст. Нужен именно анализ объекта.

Режим:
${userStates[chatId]?.mode || "📊 Анализ объекта"}

Данные пользователя:
${text || "Текстовое описание не предоставлено."}

Сформируй:

🏠 АНАЛИЗ ОБЪЕКТА

1. Краткий вывод

2. Сильные стороны

3. Слабые стороны

4. Потенциал привлекательности
Оценка от 1 до 10.
Это аналитическая оценка по предоставленным данным,
а не профессиональная оценка рыночной стоимости.

5. Что может влиять на цену

6. Кто может заинтересоваться объектом

7. Что может мешать продаже

8. Что сделать агенту

9. Чего не хватает для более точного анализа

${
  imageUrl
    ? `
10. ВИЗУАЛЬНЫЙ АНАЛИЗ ФОТО

Что видно:
Опиши только реально видимые элементы.

Визуальные сильные стороны:
Что хорошо выглядит.

Визуальные слабые стороны:
Что выглядит неудачно или требует внимания.

Что улучшить перед продажей:
Дай практические рекомендации по подготовке объекта к фото и показу.

Что сфотографировать дополнительно:
Какие помещения или детали стоит показать покупателю.
`
    : ""
}

Отвечай на русском языке.
Пиши понятно, структурированно и без лишней воды.
`;

    const content = [
      {
        type: "text",
        text: prompt
      }
    ];

    if (imageUrl) {
      content.push({
        type: "image_url",
        image_url: {
          url: imageUrl
        }
      });
    }

    console.log(
      "Отправляю запрос в OpenRouter. Фото:",
      photoFileId ? "ДА" : "НЕТ"
    );

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
                "Ты точный аналитик недвижимости. Не выдумывай факты. При наличии фотографии анализируй только визуально подтверждаемые признаки."
            },
            {
              role: "user",
              content
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter error:", errorText);
      throw new Error("OpenRouter request failed");
    }

    const data = await response.json();

    const result =
      data.choices?.[0]?.message?.content ||
      "Не удалось получить анализ.";

    await bot.sendMessage(chatId, result);

    userStates[chatId] = {};
  } catch (error) {
    console.error("Analysis error:", error);

    await bot.sendMessage(
      chatId,
      "❌ Не удалось выполнить анализ. Попробуйте ещё раз."
    );
  }
}

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
  const chatId = msg.chat.id;

  console.log(
    "Новое сообщение:",
    msg.photo ? "ФОТО" : msg.text || "другой тип сообщения"
  );

  if (msg.text === "/start") return;

  // Информация
  if (msg.text === "ℹ️ Как это работает") {
    await bot.sendMessage(
      chatId,
      "RealtorAI анализирует объект по вашим данным.\n\nФото можно добавить, но оно необязательно."
    );
    return;
  }

  // Выбор режима
  if (
    msg.text === "📊 Анализ объекта" ||
    msg.text === "💰 Оценка цены" ||
    msg.text === "💡 Что улучшить"
  ) {
    userStates[chatId] = {
      mode: msg.text,
      step: "waiting_data",
      photoFileId: null
    };

    await bot.sendMessage(
      chatId,
      "Отправьте данные об объекте одним сообщением.\n\nФото можно добавить, но оно необязательно.\n\nНапример:\n\n2-комнатная квартира, Москва\n52 м², 7 этаж из 17\nДом 2018 года\nЦена 14 500 000 ₽\nРемонт хороший\nМетро 10 минут пешком\nБалкон есть"
    );

    return;
  }

  // ФОТО
  if (msg.photo && msg.photo.length > 0) {
    console.log("ФОТО ПОЛУЧЕНО от chatId:", chatId);

    const largestPhoto = msg.photo[msg.photo.length - 1];

    // Если состояния ещё нет — создаём его
    if (!userStates[chatId]) {
      userStates[chatId] = {
        mode: "📊 Анализ объекта",
        step: "waiting_data",
        photoFileId: null
      };
    }

    userStates[chatId].photoFileId = largestPhoto.file_id;

    console.log("file_id фотографии сохранён");

    if (msg.caption && msg.caption.trim()) {
      await analyzeProperty(
        chatId,
        msg.caption.trim(),
        largestPhoto.file_id
      );
    } else {
      await bot.sendMessage(
        chatId,
        "📷 Фото получил.\n\nТеперь отправьте описание объекта текстом.\n\nНапример: 2-комнатная квартира, 52 м², цена 14 млн ₽, 7 этаж, хороший ремонт."
      );
    }

    return;
  }

  // ТЕКСТ
  if (msg.text) {
    if (!userStates[chatId]) {
      userStates[chatId] = {
        mode: "📊 Анализ объекта",
        step: "waiting_data",
        photoFileId: null
      };
    }

    const photoFileId = userStates[chatId].photoFileId;

    await analyzeProperty(
      chatId,
      msg.text,
      photoFileId
    );
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
```

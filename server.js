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
      imageUrl = await bot.getFileLink(photoFileId);
    }

    const prompt = `
Ты — профессиональный AI-аналитик недвижимости RealtorAI.

Твоя задача — анализировать объект недвижимости максимально точно.

КРИТИЧЕСКИЕ ПРАВИЛА:

1. Факты из текста пользователя считай подтвержденными фактами.
2. Фотография показывает только то, что действительно визуально видно.
3. Никогда не выдумывай площадь, цену, адрес, район, этаж, год дома,
   расстояние до метро, юридический статус или другие характеристики.
4. Не называй предположение фактом.
5. Если информации недостаточно — прямо укажи, чего не хватает.
6. Не утверждай, что цена выше или ниже рынка, если у тебя нет реальных
   рыночных данных для сравнения.
7. Если есть фотография, отдельно отмечай визуальные наблюдения.
8. Анализируй именно объект недвижимости, а не создавай рекламный текст.

Режим анализа:
${userStates[chatId]?.mode || "📊 Анализ объекта"}

Данные пользователя:
${text || "Пользователь не предоставил текстовое описание."}

${
  imageUrl
    ? "К фотографии относись как к дополнительному источнику визуальных наблюдений."
    : "Фотографии нет. Выполняй анализ только по текстовым данным."
}

Сформируй ответ:

🏠 АНАЛИЗ ОБЪЕКТА

1. Краткий вывод
Коротко оцени привлекательность объекта на основании известных данных.

2. Сильные стороны
Только реальные преимущества из предоставленных данных.

3. Слабые стороны
Только подтвержденные недостатки или объективно отсутствующие данные.

4. Потенциал привлекательности
Оценка от 1 до 10.
Обязательно напиши, что это аналитическая оценка по предоставленным данным,
а не профессиональная оценка рыночной стоимости.

5. Что может влиять на цену
Укажи известные факторы и отдельно перечисли важные неизвестные факторы.

6. Кто может заинтересоваться объектом
Опиши наиболее вероятный тип покупателя только на основании характеристик объекта.

7. Что может мешать продаже
Укажи реальные возможные препятствия.
Не выдавай предположения за факты.

8. Что сделать агенту
Дай практические действия для повышения привлекательности объекта.

9. Чего не хватает для более точного анализа
Список конкретных недостающих данных.

${
  imageUrl
    ? `
10. ВИЗУАЛЬНЫЙ АНАЛИЗ ФОТО

Что видно:
Опиши только то, что действительно видно на фотографии.

Визуальные сильные стороны:
Что хорошо выглядит на фото.

Визуальные слабые стороны:
Что выглядит неудачно или требует внимания.

Что улучшить перед продажей:
Практические рекомендации по подготовке квартиры к съемке/показу.

Что сфотографировать дополнительно:
Какие помещения, детали или виды стоит показать покупателю.

ВАЖНО:
Не определяй по фотографии точную площадь, цену, адрес, этаж, год дома
или юридические характеристики.
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
                "Ты точный аналитик недвижимости. При наличии фотографии анализируй только визуально подтверждаемые признаки. Не выдумывай факты."
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
  if (msg.text === "/start") return;

  const chatId = msg.chat.id;

  if (msg.text === "ℹ️ Как это работает") {
    await bot.sendMessage(
      chatId,
      "RealtorAI анализирует объект по вашим данным.\n\nФото можно добавить, но это необязательно."
    );
    return;
  }

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

  if (userStates[chatId]?.step !== "waiting_data") {
    return;
  }

  // Если пользователь отправил фотографию
  if (msg.photo && msg.photo.length > 0) {
    const largestPhoto = msg.photo[msg.photo.length - 1];

    userStates[chatId].photoFileId = largestPhoto.file_id;

    // Если вместе с фото есть подпись — сразу анализируем
    if (msg.caption && msg.caption.trim()) {
      await analyzeProperty(
        chatId,
        msg.caption.trim(),
        largestPhoto.file_id
      );
    } else {
      await bot.sendMessage(
        chatId,
        "📷 Фото получил.\n\nТеперь отправьте данные об объекте текстом.\n\nФото необязательно — я использую его как дополнительную информацию."
      );
    }

    return;
  }

  // Если пользователь отправил текст
  if (msg.text) {
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

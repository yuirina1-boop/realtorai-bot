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
      console.log("Получаю ссылку на фотографию");
      imageUrl = await bot.getFileLink(photoFileId);
      console.log("Ссылка на фотографию получена");
    }

    const mode = userStates[chatId]?.mode || "📊 Анализ объекта";

    const propertyText = text || "Текстовое описание не предоставлено.";

    const photoInstruction = imageUrl
      ? "Фотография предоставлена. Используй её только для визуальных наблюдений."
      : "Фотография не предоставлена. Используй только текстовые данные.";

    const prompt =
      "Ты — профессиональный AI-аналитик недвижимости RealtorAI.\n\n" +
      "Проанализируй объект только на основании предоставленных данных.\n\n" +
      "ПРАВИЛА:\n" +
      "1. Не выдумывай факты.\n" +
      "2. Факты из текста пользователя считай подтвержденными.\n" +
      "3. По фотографии описывай только то, что действительно видно.\n" +
      "4. Не определяй по фотографии точную площадь, цену, адрес, этаж или год дома.\n" +
      "5. Не выдавай предположения за факты.\n" +
      "6. Если данных недостаточно — прямо укажи, чего не хватает.\n" +
      "7. Не создавай рекламный текст. Нужен именно анализ объекта.\n\n" +
      "Режим: " + mode + "\n\n" +
      "Данные пользователя:\n" + propertyText + "\n\n" +
      photoInstruction + "\n\n" +
      "Сформируй ответ:\n\n" +
      "🏠 АНАЛИЗ ОБЪЕКТА\n\n" +
      "1. Краткий вывод\n" +
      "2. Сильные стороны\n" +
      "3. Слабые стороны\n" +
      "4. Потенциал привлекательности — оценка от 1 до 10. " +
      "Это аналитическая оценка по предоставленным данным, а не профессиональная оценка рыночной стоимости.\n" +
      "5. Что может влиять на цену\n" +
      "6. Кто может заинтересоваться объектом\n" +
      "7. Что может мешать продаже\n" +
      "8. Что сделать агенту\n" +
      "9. Чего не хватает для более точного анализа\n";

    if (imageUrl) {
      // Добавляем отдельный блок для визуального анализа.
      // Факты, которые нельзя определить по фотографии, запрещены.
      const visualText =
        "\n10. ВИЗУАЛЬНЫЙ АНАЛИЗ ФОТО\n\n" +
        "Что видно:\n" +
        "Опиши только реально видимые элементы.\n\n" +
        "Визуальные сильные стороны:\n" +
        "Что хорошо выглядит.\n\n" +
        "Визуальные слабые стороны:\n" +
        "Что выглядит неудачно или требует внимания.\n\n" +
        "Что улучшить перед продажей:\n" +
        "Практические рекомендации по подготовке объекта к фото и показу.\n\n" +
        "Что сфотографировать дополнительно:\n" +
        "Какие помещения или детали стоит показать покупателю.\n";

      prompt += visualText;
    }

    prompt +=
      "\nОтвечай на русском языке.\n" +
      "Пиши понятно, структурированно и без лишней воды.";

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
      "Отправляю запрос в OpenRouter. Фото: " +
        (photoFileId ? "ДА" : "НЕТ")
    );

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + openRouterKey,
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
              content: content
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
    "Новое сообщение: " +
      (msg.photo
        ? "ФОТО"
        : msg.text || "другой тип сообщения")
  );

  if (msg.text === "/start") {
    return;
  }

  if (msg.text === "ℹ️ Как это работает") {
    await bot.sendMessage(
      chatId,
      "RealtorAI анализирует объект по вашим данным.\n\nФото можно добавить, но оно необязательно."
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
      "Отправьте данные об объекте одним сообщением.\n\n" +
        "Фото можно добавить, но оно необязательно.\n\n" +
        "Например:\n\n" +
        "2-комнатная квартира, Москва\n" +
        "52 м², 7 этаж из 17\n" +
        "Дом 2018 года\n" +
        "Цена 14 500 000 ₽\n" +
        "Ремонт хороший\n" +
        "Метро 10 минут пешком\n" +
        "Балкон есть"
    );

    return;
  }

  // Обработка фотографии
  if (msg.photo && msg.photo.length > 0) {
    console.log("ФОТО ПОЛУЧЕНО");

    const largestPhoto = msg.photo[msg.photo.length - 1];

    if (!userStates[chatId]) {
      userStates[chatId] = {
        mode: "📊 Анализ объекта",
        step: "waiting_data",
        photoFileId: null
      };
    }

    userStates[chatId].photoFileId = largestPhoto.file_id;

    console.log("Фото сохранено");

    if (msg.caption && msg.caption.trim()) {
      await analyzeProperty(
        chatId,
        msg.caption.trim(),
        largestPhoto.file_id
      );
    } else {
      await bot.sendMessage(
        chatId,
        "📷 Фото получил.\n\n" +
          "Теперь отправьте описание объекта текстом.\n\n" +
          "Например: 2-комнатная квартира, 52 м², цена 14 млн ₽, 7 этаж, хороший ремонт."
      );
    }

    return;
  }

  // Обработка текста
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
  console.log("HTTP server is running on port " + PORT);
});

console.log("RealtorAI Telegram bot is running");

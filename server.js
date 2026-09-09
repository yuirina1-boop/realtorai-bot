require("dotenv").config();

const express = require("express");
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is not configured");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

bot.onText(/^\/start$/, async (msg) => {
  const chatId = msg.chat.id;

  await bot.sendMessage(
    chatId,
    "🏠 RealtorAI\n\nСоздавайте объявления о недвижимости с помощью AI.\n\nНажмите «Создать объявление», чтобы начать.",
    {
      reply_markup: {
        keyboard: [
          ["🏠 Создать объявление"],
          ["ℹ️ Как это работает"]
        ],
        resize_keyboard: true
      }
    }
  );
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text === "/start") return;

  if (msg.text === "ℹ️ Как это работает") {
    await bot.sendMessage(
      msg.chat.id,
      "RealtorAI превращает характеристики объекта недвижимости в готовые тексты для публикации."
    );
  }

  if (msg.text === "🏠 Создать объявление") {
    await bot.sendMessage(
      msg.chat.id,
      "Отлично! 🏠\n\nСкоро здесь появится пошаговое создание объявления."
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

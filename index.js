// const express = require("express");
const getCollection = require("./db").getCollection;
const dotenv = require("dotenv");

// const PORT = process.env.PORT || 3000;

// const app = express();
// app.get("/", (req, res) => res.send("🚀 Bot is running fine!"));
// app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const API_KEY = process.env.API_KEY;

const timeFrameMsMap = {
  "5min": 5 * 60 * 1000,
  "15min": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
};

async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  const params = {
    chat_id: CHAT_ID,
    text: message,
    parse_mode: "HTML",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const data = await res.json();
  } catch (err) {
    console.error("❌ Error sending message:", err);
  }
}

function calculateATR(candles, period = 14) {
  const n = candles.length;
  if (n === 0) return [];
  if (n <= period) {
    return Array(n).fill(NaN);
  }

  const TR = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) {
    const high = Number(candles[i].high);
    const low = Number(candles[i].low);
    const prevClose = Number(candles[i - 1].close);
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    TR[i] = tr;
  }

  const ATR = new Array(n).fill(NaN);

  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += TR[i];
  }
  const firstAtr = sum / period;
  ATR[period] = firstAtr;

  for (let i = period + 1; i < n; i++) {
    ATR[i] = (ATR[i - 1] * (period - 1) + TR[i]) / period;
  }

  return ATR;
}

const timeFrame = "15min";
const symbols = ["bnb/usd", "eth/usd", "xaut/usd"];
let records = [];

async function addRecord(newItem, collection) {
  const isDuplicate = await collection.findOne({
    timeFrame: newItem.timeFrame,
    symbol: newItem.symbol,
    price: newItem.price,
  });

  if (!isDuplicate) {
    await collection.insertOne(newItem);
    await sendTelegramMessage(
      newItem.symbol +
        "\n" +
        newItem.timeFrame +
        "\n" +
        newItem.price +
        "\n" +
        newItem.time
    );
    const counts = await collection.count();

    if (counts > 40) {
      const oldest = await collection.findOne({}, { sort: { _id: 1 } });
      if (oldest) {
        await collection.deleteOne({ _id: oldest._id });
      }
    }
  }
}

function getRecords() {
  return records;
}

const findSignal = async (data, symbol) => {
  const atrs = calculateATR(data);
  const collection = await getCollection(symbol);
  let index = 0;
  for (const candle of data) {
    const bodyCandle = Math.abs(candle.close - candle.open);
    if (bodyCandle >= atrs[index] * 2) {
      const date = new Date(candle.time * 1000 + 1000 * 60 * 60 * 3.5);
      const hours = date.getHours();
      const minutes = date.getMinutes();
      await addRecord(
        {
          timeFrame,
          symbol,
          price: (candle.open + candle.close) / 2,
          time: `${hours}:${minutes}`,
        },
        collection
      );
    }
    index += 1;
  }
};

async function getDataFromService(symbol) {
  const res = await fetch(
    `https://api.twelvedata.com/time_series?symbol=${symbol}&outputsize=500&base_exchange=bybit&interval=${timeFrame}&apikey=${API_KEY}`
  );
  const data = await res.json();

  const candles = data?.values?.map((candle) => ({
    time: new Date(candle.datetime).getTime() / 1000,
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
  }));

  await findSignal(candles.reverse(), symbol);
}

async function mapForSymbols() {
  for (const symbol of symbols) {
    await getDataFromService(symbol);
  }
  console.log("is Complete");
}

(async () => {
  try {
    await mapForSymbols();
    // setInterval(mapForSymbols, timeFrameMsMap[timeFrame]);
  } catch (err) {
    console.error("Error:", err);
  }
})();

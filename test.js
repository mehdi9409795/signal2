const fs = require("fs");

const BOT_TOKEN = "7963519635:AAGDvohFhFMtnE4wbHy9icnxuUqPtkeKBZc";
const CHAT_ID = "85395051";

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
    // برای تعداد کم کندل نمیشه ATR محاسبه کرد؛ برمی‌گردونیم آرایه با NaN
    return Array(n).fill(NaN);
  }

  // محاسبه‌ی TR برای هر کندل (TR برای کندل i براساس high[i], low[i], close[i-1])
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

  // آرایهٔ خروجی ATR هم‌طول با کندل‌ها؛ مقدار در ایندکس i نشانگر ATR برای کندل i هست
  const ATR = new Array(n).fill(NaN);

  // مقدار اولیه: میانگین ساده‌ی TRها از i = 1 تا i = period
  let sum = 0;
  for (let i = 1; i <= period; i++) {
    sum += TR[i];
  }
  const firstAtr = sum / period;
  ATR[period] = firstAtr;

  // حالا از i = period+1 تا آخر با فرمول Wilder ادامه می‌دهیم
  for (let i = period + 1; i < n; i++) {
    // ATR[i] مربوط به کندل i است و براساس ATR[i-1] و TR[i] محاسبه می‌شود
    ATR[i] = (ATR[i - 1] * (period - 1) + TR[i]) / period;
  }

  return ATR;
}

const FILE_PATH = "./storedData.json";
const timeFrame = "15min";
const symbols = ["bnb/usd", "eth/usd", "xaut/usd"];
function loadRecords() {
  if (!fs.existsSync(FILE_PATH)) return {};
  try {
    const data = JSON.parse(fs.readFileSync(FILE_PATH, "utf8"));
    return data || {};
  } catch {
    return {};
  }
}

function saveRecords(records) {
  fs.writeFileSync(FILE_PATH, JSON.stringify(records));
}

let records = loadRecords();

function isDuplicate(newItem, items) {
  return items?.some(
    (item) =>
      item.timeFrame === newItem.timeFrame &&
      item.symbol === newItem.symbol &&
      item.price === newItem.price
  );
}

function addRecord(newItem) {
  const items = records[newItem.symbol] || [];
  if (!isDuplicate(newItem, items)) {
    items?.push(newItem);
    if (items?.length > 50) items?.shift();
    records = { ...records, [newItem.symbol]: items };
    saveRecords(records);
    sendTelegramMessage(
      newItem.symbol +
        "\n" +
        newItem.timeFrame +
        "\n" +
        newItem.price +
        "\n" +
        newItem.time
    );
    return true;
  }
  return false;
}

function getRecords() {
  return records;
}

const findSignal = (data, symbol) => {
  const atrs = calculateATR(data);
  data?.map((candle, index) => {
    const bodyCandle = Math.abs(candle.close - candle.open);
    if (bodyCandle >= atrs[index] * 2) {
      const date = new Date(candle.time * 1000 + 1000 * 60 * 60 * 3.5);
      const hours = date.getHours();
      const minutes = date.getMinutes();
      addRecord({
        timeFrame,
        symbol,
        price: (candle.open + candle.close) / 2,
        time: `${hours}:${minutes}`,
      });
    }
  });
};

async function getDataFromService(symbol) {
  const res = await fetch(
    `https://api.twelvedata.com/time_series?symbol=${symbol}&outputsize=500&base_exchange=bybit&interval=${timeFrame}&apikey=5bbad3eb48cf4ed98433686a07ebb895`
  );
  const data = await res.json();

  const candles = data?.values?.map((candle) => ({
    time: new Date(candle.datetime).getTime() / 1000,
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
  }));

  findSignal(candles.reverse(), symbol);
}

async function mapForSymbols() {
  for (const symbol of symbols) await getDataFromService(symbol);
  console.log("is Complete");
}
mapForSymbols();
setInterval(mapForSymbols, timeFrameMsMap[timeFrame]);

// server.js
const express = require('express');
const cors = require('cors');
const Papa = require('papaparse');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Google Sheet CSV 來源
const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTmDS8gf3encx-azPIcKctt45iH7VqjD-9QDN4kM7kvT5ixvlBzbxMZPC12w4bmATSgXF_QoTRQlVbf/pub?output=csv';

// 🧩 依據你提供的欄位列對應：
// ID	角色名字	屬性	HP	MP	物理攻擊	物理訪愈	魔法攻擊	魔法防禦	價值	角色種類	圖片連結	簡述
const MAGIC_KEY    = '魔法攻擊';
const PHYSICAL_KEY = '物理攻擊';
const VALUE_KEY    = '價值';

// ------------------------------------------------------
// 共用：下載並解析 Google Sheet CSV → 回傳 rows 陣列
// ------------------------------------------------------
async function fetchSheetRows() {
  const response = await fetch(CSV_URL);
  if (!response.ok) {
    throw new Error(`下載 CSV 失敗：HTTP ${response.status}`);
  }

  const csvText = await response.text();

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length) {
    const firstErr = parsed.errors[0];
    throw new Error(`CSV 解析錯誤：${firstErr.message || JSON.stringify(firstErr)}`);
  }

  return parsed.data; // 陣列，每一筆是物件（欄位名稱為 key）
}

// ------------------------------------------------------
// GET /
// 顯示 API 列表
// ------------------------------------------------------
app.get('/', (req, res) => {
  res.send(`
    <h2>Available APIs</h2>
    <ul>
      <li><a href="/api/sheet-data" target="_blank">GET /api/sheet-data</a> — 取得 Google Sheet CSV 的所有資料</li>
      <li><a href="/api/top-characters?type=magic" target="_blank">GET /api/top-characters?type=magic</a> — 魔法攻擊最高的 5 位角色（同攻擊時以價值高優先）</li>
      <li><a href="/api/top-characters?type=physical" target="_blank">GET /api/top-characters?type=physical</a> — 物理攻擊最高的 5 位角色（同攻擊時以價值高優先）</li>
      <li><a href="/api/top-characters?type=value" target="_blank">GET /api/top-characters?type=value</a> — 價值最高的 5 位角色（同價值時以魔法攻擊高優先）</li>
    </ul>
    <p>Node.js Google Sheet API Server running.</p>
  `);
});

// ------------------------------------------------------
// GET /api/sheet-data
// 回傳 Google Sheet CSV 的資料（全部 JSON）
// ------------------------------------------------------
app.get('/api/sheet-data', async (req, res) => {
  try {
    const rows = await fetchSheetRows();
    res.json({
      success: true,
      rows,
    });
  } catch (err) {
    console.error('API 錯誤：', err);
    res.status(500).json({
      success: false,
      message: '伺服器錯誤',
      error: err.message,
    });
  }
});

// ------------------------------------------------------
// GET /api/top-characters?type=magic|physical|value
// magic   : 先比「魔法攻擊」，再比「價值」，都由高到低
// physical: 先比「物理攻擊」，再比「價值」，都由高到低
// value   : 先比「價值」，再比「魔法攻擊」，都由高到低
// ------------------------------------------------------
app.get('/api/top-characters', async (req, res) => {
  const { type } = req.query; // magic / physical / value

  if (!['magic', 'physical', 'value'].includes(type)) {
    return res.status(400).json({
      success: false,
      message: "查詢參數錯誤：type 必須是 'magic'、'physical' 或 'value'",
    });
  }

  let primaryKey;
  let secondaryKey;

  if (type === 'magic') {
    primaryKey = MAGIC_KEY;      // 主排序：魔法攻擊
    secondaryKey = VALUE_KEY;    // 次排序：價值
  } else if (type === 'physical') {
    primaryKey = PHYSICAL_KEY;   // 主排序：物理攻擊
    secondaryKey = VALUE_KEY;    // 次排序：價值
  } else { // type === 'value'
    primaryKey = VALUE_KEY;      // 主排序：價值
    secondaryKey = MAGIC_KEY;    // 次排序：魔法攻擊（你要改成物理攻擊也可以）
  }

  try {
    const rows = await fetchSheetRows();

    const mapped = rows.map((row) => {
      const primaryRaw = parseFloat(row[primaryKey]);
      const secondaryRaw = parseFloat(row[secondaryKey]);

      const primaryVal = isNaN(primaryRaw) ? 0 : primaryRaw;
      const secondaryVal = isNaN(secondaryRaw) ? 0 : secondaryRaw;

      return {
        ...row,
        __primary: primaryVal,
        __secondary: secondaryVal,
      };
    });

    // 排序：先主，再次，都是由高到低
    const sorted = mapped.sort((a, b) => {
      if (b.__primary !== a.__primary) {
        return b.__primary - a.__primary;
      }
      return b.__secondary - a.__secondary;
    });

    const top5 = sorted.slice(0, 5).map(({ __primary, __secondary, ...rest }) => rest);

    res.json({
      success: true,
      rows: top5,
      type,
      sortFieldPrimary: primaryKey,
      sortFieldSecondary: secondaryKey,
    });
  } catch (err) {
    console.error('API 錯誤：', err);
    res.status(500).json({
      success: false,
      message: '伺服器錯誤',
      error: err.message,
    });
  }
});

// ------------------------------------------------------
// Server 啟動
// ------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});

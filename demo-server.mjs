import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3456;

const leadSessions = new Map();
const DATA_DIR = path.join(__dirname, "data");

function appendCsv(filename, row) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const file = path.join(DATA_DIR, filename);
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const line = row.map(escape).join(",") + "\n";
    if (!fs.existsSync(file)) {
      const headers = {
        "chats.csv": ["Timestamp", "Session ID", "User message", "Auren reply"],
        "qualified.csv": ["Timestamp", "Name", "Phone", "Budget", "Timeline", "Notes", "Session ID"],
        "unqualified.csv": ["Timestamp", "Session ID", "Reason", "Last user message"],
      };
      fs.writeFileSync(file, headers[filename].map(escape).join(",") + "\n");
    }
    fs.appendFileSync(file, line);
  } catch (err) {
    console.warn("Could not write to local CSV (read-only filesystem):", err.message);
  }
}

function loadEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
}

loadEnv();

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".txt": "text/plain",
  ".webp": "image/webp",
};

const BLOCKED_SEGMENTS = [
  ".env",
  "personality",
  "listings.txt",
  "system-prompt.txt",
  ".env.example",
];

function isBlockedRequest(urlPath) {
  const decoded = decodeURIComponent(urlPath).replace(/\\/g, "/").toLowerCase();
  return BLOCKED_SEGMENTS.some(
    (segment) =>
      decoded === `/${segment}` ||
      decoded.endsWith(`/${segment}`) ||
      decoded.includes(`/${segment}/`) ||
      decoded.startsWith(`/${segment}`)
  );
}

function buildSystemPrompt() {
  const instructions = fs.readFileSync(
    path.join(__dirname, "personality", "instructions.txt"),
    "utf8"
  );
  const listings = fs.readFileSync(path.join(__dirname, "listings.txt"), "utf8");
  return `${instructions.trim()}\n${listings.trim()}`;
}

let systemPrompt = "";

try {
  systemPrompt = buildSystemPrompt();
} catch (err) {
  console.error("Failed to load system prompt:", err.message);
}

// Listings cache — fetches from Google Sheet every 60s
let listingsCache = { value: '', expires: 0 };

async function getListings() {
  if (Date.now() < listingsCache.expires) return listingsCache.value;
  try {
    const url = process.env.LISTINGS_CSV_URL;
    if (!url) throw new Error('LISTINGS_CSV_URL not set');
    const res = await fetch(url);
    const csv = await res.text();
    const lines = csv.trim().split('\n').slice(1);
    const value = lines
      .filter(l => l.trim())
      .map((line, i) => {
        const cols = [];
        let cur = '', inQ = false;
        for (const ch of line + ',') {
          if (ch === '"') { inQ = !inQ; continue; }
          if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; continue; }
          cur += ch;
        }
        const [address, area, beds, baths, price, type, features, status] = cols;
        if ((status || '').toLowerCase() !== 'active') return null;
        return `${i + 1}. ${address}, ${area} — ${beds} bed, ${baths} bath, ${price} — ${type}${features ? '. ' + features : ''}`;
      })
      .filter(Boolean)
      .join('\n');
    listingsCache = { value: value || 'No active listings.', expires: Date.now() + 60_000 };
    return listingsCache.value;
  } catch (err) {
    console.error('Listings fetch error:', err.message);
    // Fallback to local listings.txt
    try { return fs.readFileSync('./listings.txt', 'utf8').trim(); } catch { return 'No active listings.'; }
  }
}

async function logLead(sessionId, messages) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return;
  const text = messages.map(m => m.content).join(' ');
  const name = text.match(/(?:I'?m|my name is|name'?s?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i)?.[1] || '';
  const phone = text.match(/\b(\+?1?\s*[-.]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/)?.[1] || '';
  const budget = text.match(/\$[\d,]+k?|\b\d{3,}k\b/i)?.[0] || '';
  const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, name, phone, budget, lastMessage: lastUser.slice(0, 200) })
    }); // fire and forget — don't await
  } catch {}
}

async function postToSheets(payload) {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (url) {
    try {
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        redirect: "follow",
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn("Sheets:", err.message);
    }
  }

  const ts = payload.timestamp || new Date().toISOString();
  if (payload.type === "chat") {
    appendCsv("chats.csv", [ts, payload.sessionId, payload.userMessage, payload.botReply]);
  } else if (payload.type === "qualified") {
    appendCsv("qualified.csv", [
      ts,
      payload.name,
      payload.phone,
      payload.budget,
      payload.timeline,
      payload.notes,
      payload.sessionId,
    ]);
  } else if (payload.type === "unqualified") {
    appendCsv("unqualified.csv", [ts, payload.sessionId, payload.reason, payload.lastMessage]);
  }
}

function conversationText(messages) {
  return messages.map((m) => String(m.content ?? "")).join("\n");
}

function extractLeadFields(messages) {
  const text = conversationText(messages);
  const userText = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");

  const phone =
    text.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] || "";
  const budget =
    text.match(/\$[\d,]+(?:k)?|\b\d{3,}\s*k\b|\d+\s*(?:thousand|million)/i)?.[0] ||
    "";
  const timeline =
    text.match(
      /\b(?:asap|immediately|next month|this month|\d+\s*months?)\b/i
    )?.[0] || "";
  const nameMatch = text.match(
    /\b(?:i'?m|my name is|this is)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i
  );

  return {
    phone,
    budget,
    timeline,
    name: nameMatch?.[1] || "",
    userText,
  };
}

function evaluateLead(messages) {
  const { phone, budget, timeline, name, userText } = extractLeadFields(messages);

  if (
    /not interested|stop (?:texting|messaging)|leave me alone|don'?t contact|no longer looking/i.test(
      userText
    )
  ) {
    return {
      status: "unqualified",
      reason: "Not interested / opted out",
      lastMessage: userText.split("\n").pop() || "",
    };
  }

  const hasIntent =
    budget ||
    timeline ||
    /viewing|tour|book|schedule|call me|ready to buy|make an offer/i.test(userText);

  if (phone && hasIntent) {
    return {
      status: "qualified",
      name,
      phone,
      budget,
      timeline,
      notes: "Demo qualification: contact + intent captured",
    };
  }

  return { status: null };
}

async function logConversation(sessionId, userMessage, botReply, messages) {
  await postToSheets({
    type: "chat",
    timestamp: new Date().toISOString(),
    sessionId,
    userMessage,
    botReply,
  });

  const state = leadSessions.get(sessionId) || {
    qualified: false,
    unqualified: false,
  };
  const result = evaluateLead(messages);

  if (result.status === "qualified" && !state.qualified) {
    state.qualified = true;
    await postToSheets({
      type: "qualified",
      timestamp: new Date().toISOString(),
      sessionId,
      ...result,
    });
  }

  if (result.status === "unqualified" && !state.unqualified) {
    state.unqualified = true;
    await postToSheets({
      type: "unqualified",
      timestamp: new Date().toISOString(),
      sessionId,
      reason: result.reason,
      lastMessage: result.lastMessage,
    });
  }

  leadSessions.set(sessionId, state);
}

async function handleChat(body) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY missing in .env");
  if (!systemPrompt) throw new Error("System prompt not loaded");

  const payload = JSON.parse(body);
  const { messages = [], sessionId = randomUUID() } = payload;
  const userMessage =
    [...messages].reverse().find((m) => m.role === "user")?.content || "";

  const listings = await getListings();
  const liveSystemPrompt = systemPrompt.replace(
    /LISTINGS[\s\S]*$/m,
    `LISTINGS (live from realtor's sheet):\n${listings}`
  );

  const groqMessages = [
    { role: "system", content: liveSystemPrompt },
    ...messages.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? ""),
    })),
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: groqMessages,
      max_tokens: 512,
      temperature: 0.7,
    }),
  });

  if (!res.ok) throw new Error(`Groq error ${res.status}`);
  const data = await res.json();
  const reply =
    data.choices?.[0]?.message?.content?.trim() ||
    "Let me connect you with our team directly.";

  const withReply = [...messages, { role: "assistant", content: reply }];
  logConversation(sessionId, userMessage, reply, withReply).catch(() => {});
  logLead(sessionId, withReply);

  return { reply, sessionId };
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/config') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ leadsUrl: process.env.SHEETS_WEBHOOK_URL || '' }));
    return;
  }

  if (req.method === "GET" && req.url === "/api/health") {
    const ok = Boolean(process.env.GROQ_API_KEY && systemPrompt);
    res.writeHead(ok ? 200 : 503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok }));
    return;
  }

  if (req.method === "POST" && req.url === "/webhook/auren-chat") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const json = await handleChat(body);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(json));
      } catch {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ reply: "Let me connect you with our team directly." })
        );
      }
    });
    return;
  }

  const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];

  if (isBlockedRequest(urlPath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const filePath = path.join(
    __dirname,
    req.url === "/" ? "index.html" : req.url.split("?")[0]
  );
  const safe = path.normalize(filePath);
  if (!safe.startsWith(__dirname) || !fs.existsSync(safe) || fs.statSync(safe).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(safe);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(safe).pipe(res);
});

if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`Auren demo: http://localhost:${PORT}/`);
    console.log(`Leads log: ${DATA_DIR} (import CSVs into Google Sheets anytime)`);
    if (!process.env.SHEETS_WEBHOOK_URL) {
      console.log("Google live sync: add SHEETS_WEBHOOK_URL to .env (google-apps-script/SETUP.md)");
    }
  });
}

export default server;

const JSONBIN_ROOT = "https://api.jsonbin.io/v3/b";
const MAX_SCORE = 10000000;

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

function sanitizeName(name) {
  return String(name || "")
    .trim()
    .replace(/[<>]/g, "")
    .slice(0, 50);
}

function isValidSelfie(selfie) {
  return typeof selfie === "string"
    && /^data:image\/(jpeg|png|webp);base64,/.test(selfie);
}

function isSameDay(isoStr) {
  if (!isoStr) return false;

  const date = new Date(isoStr);
  if (Number.isNaN(date.getTime())) return false;

  return date.toDateString() === new Date().toDateString();
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function getJsonBinConfig() {
  const binId = process.env.JSONBIN_BIN_ID;
  const apiKey = process.env.JSONBIN_API_KEY;

  if (!binId || !apiKey) {
    throw new Error("JSONBin environment variables are not configured.");
  }

  return {
    url: `${JSONBIN_ROOT}/${binId}`,
    apiKey,
  };
}

async function fetchScores() {
  const { url, apiKey } = getJsonBinConfig();
  const response = await fetch(`${url}/latest`, {
    headers: {
      "X-Master-Key": apiKey,
      "X-Bin-Meta": "false",
    },
  });

  if (!response.ok) {
    throw new Error(`JSONBin read failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const scores = Array.isArray(data.scores) ? data.scores : [];

  return scores
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 100);
}

async function updateScores(scores) {
  const { url, apiKey } = getJsonBinConfig();
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Master-Key": apiKey,
    },
    body: JSON.stringify({ scores }),
  });

  if (!response.ok) {
    throw new Error(`JSONBin update failed: HTTP ${response.status}`);
  }
}

async function saveScore(payload) {
  const name = sanitizeName(payload.name);
  const score = Math.floor(Number(payload.score));
  const selfie = payload.selfie;

  if (!name) {
    return { error: "Player name is required." };
  }

  if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
    return { error: "Score is invalid." };
  }

  if (!isValidSelfie(selfie)) {
    return { error: "Selfie image is invalid." };
  }

  const existingScores = await fetchScores();
  const newEntry = {
    name,
    score,
    selfie,
    date: new Date().toISOString(),
  };

  const filteredScores = existingScores.filter(entry =>
    !(entry.name === name && Number(entry.score || 0) <= score && isSameDay(entry.date))
  );

  filteredScores.push(newEntry);
  filteredScores.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));

  const top100 = filteredScores.slice(0, 100);
  await updateScores(top100);

  const rank = top100.findIndex(entry => entry.date === newEntry.date) + 1;
  return { rank: rank > 0 ? rank : null, scores: top100 };
}

module.exports = async function leaderboardHandler(req, res) {
  try {
    if (req.method === "GET") {
      const scores = await fetchScores();
      return sendJson(res, 200, { scores });
    }

    if (req.method === "POST") {
      const result = await saveScore(await readBody(req));
      if (result.error) return sendJson(res, 400, { message: result.error });
      return sendJson(res, 200, result);
    }

    res.setHeader("Allow", "GET, POST");
    return sendJson(res, 405, { message: "Method not allowed." });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { message: "Leaderboard service unavailable." });
  }
};

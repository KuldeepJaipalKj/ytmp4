// Helper: Sleep function for polling delays
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: Extract YouTube Video ID
function extractVideoId(input) {
  if (!input) return null;

  // Direct 11-char Video ID check
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }

  try {
    const parsedUrl = new URL(input);
    const host = parsedUrl.hostname.toLowerCase();
    const path = parsedUrl.pathname;

    if (host.includes('youtube.com')) {
      const vParam = parsedUrl.searchParams.get('v');
      if (vParam && /^[a-zA-Z0-9_-]{11}$/.test(vParam)) {
        return vParam;
      }

      const shortsMatch = path.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1];

      const embedMatch = path.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];
    }

    if (host === 'youtu.be' || host === 'www.youtu.be') {
      const youtuMatch = path.match(/^\/([a-zA-Z0-9_-]{11})/);
      if (youtuMatch) return youtuMatch[1];
    }
  } catch (e) {
    return null;
  }

  return null;
}

// 3 Servers Configuration
const servers = [
  {
    name: 'epsilon',
    host: 'epsilon.epsiloncloud.org',
    origin: 'convertytmp3.org',
    extraParams: ''
  },
  {
    name: 'theta',
    host: 'theta.thetacloud.org',
    origin: 'mp3juice.sc',
    extraParams: ''
  },
  {
    name: 'aood',
    host: 'www1.aood.download',
    origin: 'ytshortsdl.com',
    extraParams: '&mode=downloader'
  }
];

// Universal API Request Handler
async function executeApiRequest(videoid, server) {
  const baseUrl = server.host;
  const originHost = server.origin;
  const extraParams = server.extraParams;
  const f = 'mp4';

  try {
    // Step 1: Auth Request
    const timestamp = Date.now();
    const authRes = await fetch(`https://${baseUrl}/api/v1/auth?_=${timestamp}`, {
      headers: {
        'Accept': '*/*',
        'Origin': `https://${originHost}`,
        'Referer': `https://${originHost}/`,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36'
      }
    });

    if (!authRes.ok) return false;
    const authData = await authRes.json();
    if (!authData.key) return false;

    // Step 2: Init Request
    const timestamp2 = Date.now();
    const initHeaders = {
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8,es;q=0.7,pa;q=0.6',
      'Authorization': 'Bearer ' + authData.key,
      'Cache-Control': 'no-cache',
      'Origin': `https://${originHost}`,
      'Pragma': 'no-cache',
      'Referer': `https://${originHost}/`,
      'Sec-CH-UA': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
      'Sec-CH-UA-Mobile': '?1',
      'Sec-CH-UA-Platform': '"Android"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36'
    };

    const initRes = await fetch(`https://${baseUrl}/api/v1/init?_=${timestamp2}`, { headers: initHeaders });
    if (!initRes.ok) return false;
    const initJson = await initRes.json();
    if (!initJson.convertURL) return false;

    // Step 3: Convert URL Request
    const convertURL = initJson.convertURL;
    const separator = convertURL.includes('?') ? '&' : '?';
    const timestamp3 = Date.now();
    const finalURL = `${convertURL}${separator}v=${encodeURIComponent(videoid)}&f=${encodeURIComponent(f)}${extraParams}&_=${timestamp3}`;

    const convertHeaders = {
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8,es;q=0.7,pa;q=0.6',
      'Cache-Control': 'no-cache',
      'Origin': `https://${originHost}`,
      'Pragma': 'no-cache',
      'Referer': `https://${originHost}/`,
      'Sec-CH-UA': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
      'Sec-CH-UA-Mobile': '?1',
      'Sec-CH-UA-Platform': '"Android"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36'
    };

    const convertRes = await fetch(finalURL, { headers: convertHeaders });
    if (!convertRes.ok) return false;
    const convertJson = await convertRes.json();

    const progressURL = convertJson.progressURL;
    const downloadURL = convertJson.downloadURL;

    if (!progressURL || !downloadURL) return false;

    // Step 4: Progress Polling (Optimized for Vercel 10s Timeout)
    const maxAttempts = 12;
    let progressData = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const timestamp4 = Date.now();
      const sep = progressURL.includes('?') ? '&' : '?';
      const requestURL = `${progressURL}${sep}_=${timestamp4}`;

      const progressRes = await fetch(requestURL, { headers: convertHeaders });
      if (progressRes.ok) {
        const data = await progressRes.json();
        if (data && typeof data === 'object') {
          progressData = data;
          if (data.progress === 3 && data.error === 0) {
            break;
          }
        }
      }
      // Reduced delay to 500ms for fast execution on serverless
      await sleep(500);
    }

    // Step 5: Build Final Download Link
    const sepDl = downloadURL.includes('?') ? '&' : '?';
    const finalDownloadURL = `${downloadURL}${sepDl}v=${encodeURIComponent(videoid)}&f=${encodeURIComponent(f)}&r=${encodeURIComponent(originHost)}`;

    return {
      server: server.name,
      title: progressData?.title || '',
      download_url: finalDownloadURL
    };

  } catch (err) {
    return false;
  }
}

// Vercel Serverless Function Handler
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url: input } = req.query;
  const videoid = extractVideoId(input);

  if (!videoid) {
    return res.status(400).json({
      error: 'Invalid YouTube URL or Video ID'
    });
  }

  // Pick a random server for load balancing
  const shuffledServers = [...servers].sort(() => 0.5 - Math.random());
  let finalResult = false;

  for (const server of shuffledServers) {
    const result = await executeApiRequest(videoid, server);
    if (result !== false) {
      finalResult = result;
      break;
    }
  }

  if (finalResult) {
    return res.status(200).json({
      status: 'completed',
      source: finalResult.server,
      title: finalResult.title,
      youtubeid: videoid,
      format: 'mp4',
      downloadUrl: finalResult.download_url
    });
  } else {
    return res.status(500).json({
      status: 'error',
      message: 'All servers failed to process the request.'
    });
  }
}

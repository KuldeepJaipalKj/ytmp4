export default async function handler(req, res) {
  const input = req.query.url || '';
  let videoid = '';

  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    videoid = input;
  } else {
    try {
      const parsedUrl = new URL(input.startsWith('http') ? input : `https://${input}`);
      const host = parsedUrl.hostname.toLowerCase();
      const path = parsedUrl.pathname;
      if (host.includes('youtube.com')) {
        videoid = parsedUrl.searchParams.get('v') || path.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/)?.[1] || path.match(/^\/embed\/([a-zA-Z0-9_-]{11})/)?.[1] || '';
      } else if (host === 'youtu.be' || host === 'www.youtu.be') {
        videoid = path.match(/^\/([a-zA-Z0-9_-]{11})/)?.[1] || '';
      }
    } catch (e) {}
  }

  if (!videoid || !/^[a-zA-Z0-9_-]{11}$/.test(videoid)) {
    return res.status(400).json({ error: 'Invalid YouTube URL or Video ID' });
  }

  const servers = [
    { name: 'epsilon', host: 'epsilon.epsiloncloud.org', origin: 'convertytmp3.org', api: 'api_key=ytmp3_ac2b76122a683e3e88885f7ac3b906a7d7e69a1d859e2d7d3859825bf347061b', extraParams: '' },
    { name: 'theta', host: 'theta.thetacloud.org', origin: 'mp3juice.sc', api: 'api_key=mp3juice_290cc01de890ab80894f66f0dea90170272426aa99dc8dcd83407d9b803c3cad', extraParams: '' },
    { name: 'aood', host: 'www1.aood.download', origin: 'ytshortsdl.com', api: 'api_key=ytshortsdl_667c62fb8d447c4f0caed126c84f2da9230ef9b528f16e7bfe015fe33560d1f7', extraParams: '&mode=downloader' }
  ];

  for (const server of servers) {
    try {
      const authRes = await fetch(`https://${server.host}/api/v1/auth?${server.api}&_=${Date.now()}`, {
        headers: { 'Origin': `https://${server.origin}`, 'Referer': `https://${server.origin}/`, 'User-Agent': 'Mozilla/5.0' }
      });
      if (!authRes.ok) continue;
      const authData = await authRes.json();
      if (!authData.key) continue;

      const initRes = await fetch(`https://${server.host}/api/v1/init?_=${Date.now()}`, {
        headers: { 'Authorization': `Bearer ${authData.key}`, 'Origin': `https://${server.origin}`, 'Referer': `https://${server.origin}/`, 'User-Agent': 'Mozilla/5.0' },
        redirect: 'manual'
      });
      if (!initRes.ok) continue;
      const initJson = await initRes.json();
      if (!initJson.convertURL) continue;

      const convRes = await fetch(`${initJson.convertURL}${initJson.convertURL.includes('?') ? '&' : '?'}v=${encodeURIComponent(videoid)}&f=mp4${server.extraParams}&_=${Date.now()}`, {
        headers: { 'Origin': `https://${server.origin}`, 'Referer': `https://${server.origin}/`, 'User-Agent': 'Mozilla/5.0' },
        redirect: 'manual'
      });
      if (!convRes.ok) continue;
      const convJson = await convRes.json();
      if (!convJson.progressURL || !convJson.downloadURL) continue;

      let progData = null;
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const pRes = await fetch(`${convJson.progressURL}${convJson.progressURL.includes('?') ? '&' : '?'}_=${Date.now()}`, {
          headers: { 'Origin': `https://${server.origin}`, 'Referer': `https://${server.origin}/`, 'User-Agent': 'Mozilla/5.0' }
        });
        progData = await pRes.json();
        if (progData && Number(progData.progress) === 3 && Number(progData.error) === 0) break;
      }

      const finalDl = `${convJson.downloadURL}${convJson.downloadURL.includes('?') ? '&' : '?'}v=${encodeURIComponent(videoid)}&f=mp4&r=${encodeURIComponent(server.origin)}`;
      return res.status(200).json({
        status: 'completed',
        source: server.name,
        title: progData?.title || '',
        youtubeid: videoid,
        format: 'mp4',
        downloadUrl: finalDl
      });
    } catch (e) {}
  }

  return res.status(500).json({ status: 'error', message: 'All servers failed.' });
}

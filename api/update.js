export default async function handler(req, res) {
  // Allow CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://rapahannock.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let body = '';

  try {
    for await (const chunk of req) {
      body += chunk;
    }

    const parsed = JSON.parse(body);
    const streamer = parsed.streamer;

    if (!streamer) {
      return res.status(400).json({ error: 'Streamer name required' });
    }

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const FILE_PATH = 'streamers.json';
    const REPO = 'rapahannock/Kick-Stream-Monitor';
    const BRANCH = 'main';

    const headers = {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3+json',
    };

    const getResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`, { headers });
    const getData = await getResp.json();
    const content = JSON.parse(Buffer.from(getData.content, 'base64').toString());

    if (content.includes(streamer)) {
      return res.status(200).json({ message: 'Streamer already exists.' });
    }

    content.push(streamer);
    const updatedContent = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');

    const updateResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Add ${streamer}`,
        content: updatedContent,
        sha: getData.sha,
        branch: BRANCH
      }),
    });

    if (!updateResp.ok) {
      const err = await updateResp.json();
      return res.status(500).json({ error: err });
    }

    res.status(200).json({ message: `${streamer} added successfully` });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}

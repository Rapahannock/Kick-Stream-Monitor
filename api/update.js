import { Buffer } from 'node:buffer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const { streamer } = req.body;

  if (!streamer || typeof streamer !== 'string') {
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

  try {
    // Fetch current file
    const getResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`, { headers });
    const getData = await getResp.json();

    const contentRaw = Buffer.from(getData.content, 'base64').toString('utf-8');
    const content = JSON.parse(contentRaw);

    if (content.includes(streamer)) {
      return res.status(200).json({ message: 'Streamer already exists.' });
    }

    content.push(streamer);
    const updatedContent = Buffer.from(JSON.stringify(content, null, 2)).toString('base64');

    // Push update to GitHub
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

    return res.status(200).json({ message: `${streamer} added successfully` });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unexpected server error' });
  }
}

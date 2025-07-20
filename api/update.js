export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  let streamer;

  try {
    const body = await parseRequestBody(req);
    streamer = body.streamer?.trim().toLowerCase();
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

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

  // Fetch the file content from GitHub
  const getResp = await fetch(`https://api.github.com/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`, { headers });
  const getData = await getResp.json();

  if (!getResp.ok || !getData.content) {
    return res.status(500).json({
      error: 'Failed to fetch streamers.json from GitHub. Check if the file exists and token permissions are correct.',
      details: getData
    });
  }

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
}

// Helper to parse raw request body (needed for serverless)
async function parseRequestBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString('utf-8');
  return JSON.parse(raw);
}

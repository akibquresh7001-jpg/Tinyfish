/**
 * TinyFish Web Agent Scraping Service
 *
 * Official TinyFish Agent API Reference:
 * - Base Endpoint: https://agent.tinyfish.ai/v1/automation/run (Synchronous Agent Execution)
 * - Alternative Streaming: https://agent.tinyfish.ai/v1/automation/run-sse (Server-Sent Events)
 * - Auth Header: X-API-Key: <API_KEY>
 * - Body: { "url": "<target_url>", "goal": "<plain_english_instruction>" }
 */

const https = require('https');
const { URL } = require('url');

// Configurable endpoint - can be overridden via environment variables
const TINYFISH_ENDPOINT = process.env.TINYFISH_API_ENDPOINT || 'https://agent.tinyfish.ai/v1/automation/run';

/**
 * Universal HTTP POST helper using built-in Node.js fetch or https module
 * (Ensures zero-dependency compatibility across Node 18+ and earlier versions)
 */
async function makePostRequest(urlStr, headers, bodyData, timeoutMs = 90000) {
  if (typeof fetch === 'function') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(urlStr, {
        method: 'POST',
        headers,
        body: JSON.stringify(bodyData),
        signal: controller.signal
      });
      clearTimeout(timer);
      const text = await response.text();
      let json;
      try {
        json = JSON.parse(text);
      } catch (err) {
        json = { rawText: text };
      }
      return { ok: response.ok, status: response.status, data: json };
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  // Fallback to native https module if global fetch is not present
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const postData = JSON.stringify(bodyData);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(postData)
        },
        timeout: timeoutMs
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let json;
          try {
            json = JSON.parse(raw);
          } catch (e) {
            json = { rawText: raw };
          }
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            data: json
          });
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out after ' + timeoutMs + 'ms'));
    });
    req.write(postData);
    req.end();
  });
}

/**
 * Parses unstructured or semi-structured agent responses into standardized job cards.
 * Expected schema per card:
 * {
 *   title: string,
 *   company: string,
 *   location: string,
 *   type: "Internship" | "Full-time",
 *   link: string,
 *   description: string
 * }
 */
function normalizeJobResults(rawResult, defaultType = 'Full-time') {
  if (!rawResult) return [];

  let candidates = [];

  // Case 1: Result is already an array
  if (Array.isArray(rawResult)) {
    candidates = rawResult;
  }
  // Case 2: Result is an object containing an array property (e.g. jobs, results, listings)
  else if (typeof rawResult === 'object') {
    const possibleArray =
      rawResult.jobs ||
      rawResult.listings ||
      rawResult.results ||
      rawResult.data ||
      rawResult.items ||
      rawResult.positions;

    if (Array.isArray(possibleArray)) {
      candidates = possibleArray;
    } else if (rawResult.rawText && typeof rawResult.rawText === 'string') {
      // Parse raw text embedded in result
      return parseUnstructuredText(rawResult.rawText, defaultType);
    } else {
      // Single job object returned directly
      if (rawResult.title || rawResult.company) {
        candidates = [rawResult];
      }
    }
  }
  // Case 3: Result is a string (could be JSON or Markdown)
  else if (typeof rawResult === 'string') {
    const trimmed = rawResult.trim();
    // Attempt JSON parse first (handles ```json ... ``` blocks as well)
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, trimmed];
    try {
      const parsed = JSON.parse(jsonMatch[1] || trimmed);
      return normalizeJobResults(parsed, defaultType);
    } catch (e) {
      // Plain text or Markdown parsing fallback
      return parseUnstructuredText(trimmed, defaultType);
    }
  }

  // Normalize candidate objects
  return candidates
    .filter((item) => item && (item.title || item.company || item.role))
    .map((item) => {
      const title = item.title || item.role || item.position || 'Open Opportunity';
      const company = item.company || item.organization || item.employer || 'Hiring Company';
      const location = item.location || item.city || item.place || (item.isRemote ? 'Remote' : 'Not specified');

      // Detect type
      let type = item.type || defaultType;
      const lowerText = `${title} ${item.type || ''} ${item.description || ''}`.toLowerCase();
      if (lowerText.includes('intern') || lowerText.includes('internship') || lowerText.includes('trainee') || lowerText.includes('fellowship')) {
        type = 'Internship';
      } else {
        type = 'Full-time';
      }

      const link =
        item.link ||
        item.url ||
        item.apply_url ||
        item.applyUrl ||
        item.job_url ||
        `https://www.google.com/search?q=${encodeURIComponent(`${title} ${company} careers apply`)}`;

      const description =
        item.description ||
        item.summary ||
        item.snippet ||
        item.shortDescription ||
        `Exciting opportunity at ${company} for ${title}.`;

      return {
        title: String(title).trim(),
        company: String(company).trim(),
        location: String(location).trim(),
        type,
        link: String(link).trim(),
        description: String(description).trim()
      };
    });
}

/**
 * Fallback parser for unstructured agent markdown/text output
 */
function parseUnstructuredText(text, defaultType = 'Full-time') {
  const jobs = [];
  // Split on double newlines or list items
  const blocks = text.split(/(?:\r?\n){2,}|\n(?=[-*#\d]+\.?\s+)/g);

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim().replace(/^[-*#\d.]+\s*/, ''))
      .filter(Boolean);

    if (lines.length === 0) continue;

    // Look for link in block
    const urlMatch = block.match(/https?:\/\/[^\s)\]]+/);
    const link = urlMatch ? urlMatch[0] : '#';

    // Heuristic: First line is often Role/Title or Company - Role
    let title = lines[0];
    let company = 'Company';
    let location = 'Location not specified';

    if (title.includes(' at ')) {
      const parts = title.split(' at ');
      title = parts[0].trim();
      company = parts.slice(1).join(' at ').trim();
    } else if (title.includes(' - ')) {
      const parts = title.split(' - ');
      company = parts[0].trim();
      title = parts.slice(1).join(' - ').trim();
    }

    // Inspect remaining lines for location and description
    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (/remote|location|hybrid|san francisco|new york|bengaluru|london|india|usa/i.test(l) && !location.includes(',')) {
        location = l.replace(/^(location:?|where:?)\s*/i, '');
      }
    }

    const description = lines.slice(1).join(' ').slice(0, 200) || `Opportunity for ${title}`;
    const isIntern = /intern/i.test(title) || /intern/i.test(description);

    if (title.length > 2 && title.length < 90) {
      jobs.push({
        title,
        company,
        location,
        type: isIntern ? 'Internship' : defaultType,
        link,
        description
      });
    }
  }

  return jobs;
}

/**
 * Primary function to scrape jobs via TinyFish Web Agent API.
 * 
 * @param {Object} options
 * @param {string[]} options.keywords - Extracted skills/search terms (e.g. ['React', 'Node.js', 'Frontend'])
 * @param {string} options.roleTitle - Extracted job role (e.g. 'Frontend Developer')
 * @param {string} options.jobType - 'Internship' | 'Full-time' | 'Both'
 * @param {string} options.location - User location preference (e.g. 'New York' or 'Remote')
 * @param {boolean} options.isRemote - Whether remote filter is toggled
 * @returns {Promise<Array>} Normalized list of jobs
 */
async function scrapeJobs({ keywords = [], roleTitle = '', jobType = 'Both', location = '', isRemote = false }) {
  const apiKey = process.env.TINYFISH_API_KEY;

  // Validation: Ensure TinyFish API key is present
  if (!apiKey || apiKey === 'your_key_here' || apiKey.trim() === '') {
    throw new Error(
      'TINYFISH_API_KEY is not configured in .env. Please add your TinyFish API key to run live searches.'
    );
  }

  // Compose search terms
  const searchRole = roleTitle || (keywords.length > 0 ? keywords.slice(0, 2).join(' ') : 'Software Engineer');
  const typeFilter = jobType === 'Both' ? 'internship OR full time job' : jobType.toLowerCase();
  const locationFilter = isRemote ? 'remote' : (location || '');
  const searchTerms = `${searchRole} ${keywords.slice(0, 3).join(' ')} ${typeFilter} ${locationFilter}`.trim();

  // Target job discovery portal (Google Jobs aggregator handles LinkedIn, Indeed, Internshala, Wellfound)
  const targetUrl = `https://www.google.com/search?q=${encodeURIComponent(searchTerms)}&ibp=htl;jobs`;

  // Explicit goal instruction telling the TinyFish AI agent how to extract structured job data
  const goal = `You are a job scout assistant. Navigate the job listings page for query: "${searchTerms}".
Locate 6 to 10 live job or internship postings that best match.
For each posting, extract:
- title: exact job title
- company: company name
- location: city/state or "Remote"
- type: "Internship" if it mentions intern/internship/trainee, otherwise "Full-time"
- link: the direct apply link or job detail URL
- description: a concise 1-2 sentence summary of requirements, skills, and duties

Return ONLY a valid JSON array of objects with keys: title, company, location, type, link, description. Do not include markdown code block backticks.`;

  // TODO: If you want to use TinyFish SSE streaming endpoint for live step-by-step UI updates,
  // change the endpoint to https://agent.tinyfish.ai/v1/automation/run-sse and parse Server-Sent Events.
  // TODO: You can also point the targetUrl directly to "https://www.linkedin.com/jobs/search?keywords=..." or "https://wellfound.com/jobs".

  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey.trim()
  };

  const payload = {
    url: targetUrl,
    goal: goal
  };

  try {
    const res = await makePostRequest(TINYFISH_ENDPOINT, headers, payload, 75000);

    if (!res.ok) {
      const errDetail = res.data?.error?.message || res.data?.message || `HTTP ${res.status}`;
      throw new Error(`TinyFish Agent API returned error (${res.status}): ${errDetail}`);
    }

    const data = res.data;

    // Check TinyFish run status
    if (data.status === 'FAILED') {
      const failureReason = data.error?.message || 'Agent failed to complete navigation';
      throw new Error(`TinyFish automation run failed: ${failureReason}`);
    }

    // Process output from data.result
    const rawResult = data.result !== undefined ? data.result : data;
    const normalized = normalizeJobResults(rawResult, jobType === 'Internship' ? 'Internship' : 'Full-time');

    return normalized;
  } catch (error) {
    // Re-throw with descriptive context
    throw new Error(`TinyFish Scraping Service: ${error.message}`);
  }
}

module.exports = {
  scrapeJobs,
  normalizeJobResults
};

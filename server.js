/**
 * JobScout - Backend Server
 * Node.js + Express
 */

require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { scrapeJobs } = require('./tinyfish');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Lightweight keyword & role title extractor from raw profile text.
 * No heavy NLP dependencies required.
 */
function extractProfileDetails(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { roleTitle: 'Software Engineer', keywords: ['Developer'] };
  }

  const cleanText = rawText.trim();
  const lowerText = cleanText.toLowerCase();

  // Known role patterns to look for
  const rolePatterns = [
    { regex: /full[\s-]stack\s*(developer|engineer)?/i, role: 'Full Stack Developer' },
    { regex: /front[\s-]end\s*(developer|engineer)?/i, role: 'Frontend Developer' },
    { regex: /back[\s-]end\s*(developer|engineer)?/i, role: 'Backend Developer' },
    { regex: /software\s*(engineer|developer)/i, role: 'Software Engineer' },
    { regex: /machine\s*learning\s*(engineer)?|ml\s*engineer|ai\s*engineer/i, role: 'Machine Learning Engineer' },
    { regex: /data\s*(scientist|analyst|engineer)/i, role: 'Data Scientist' },
    { regex: /mobile\s*(developer|engineer)?|ios\s*(developer)?|android\s*(developer)?/i, role: 'Mobile Developer' },
    { regex: /devops\s*(engineer)?|cloud\s*(engineer)?|sre/i, role: 'DevOps Engineer' },
    { regex: /ui[\s/]?ux\s*(designer)?|product\s*designer/i, role: 'UI/UX Designer' },
    { regex: /product\s*manager|associate\s*pm/i, role: 'Product Manager' },
    { regex: /cybersecurity|security\s*analyst/i, role: 'Cybersecurity Analyst' },
    { regex: /qa\s*(engineer)?|test\s*(engineer)?|quality\s*assurance/i, role: 'QA Engineer' }
  ];

  let detectedRole = null;
  for (const { regex, role } of rolePatterns) {
    if (regex.test(lowerText)) {
      detectedRole = role;
      break;
    }
  }

  // Common high-signal technical & industry keywords to extract
  const knownKeywords = [
    'react', 'react native', 'next.js', 'vue', 'angular', 'node.js', 'express',
    'typescript', 'javascript', 'python', 'java', 'c++', 'c#', 'golang', 'rust',
    'django', 'flask', 'fastapi', 'spring boot', 'sql', 'postgresql', 'mysql',
    'mongodb', 'redis', 'graphql', 'rest api', 'docker', 'kubernetes', 'aws',
    'gcp', 'azure', 'git', 'ci/cd', 'tailwind', 'figma', 'pytorch', 'tensorflow',
    'pandas', 'numpy', 'linux', 'html', 'css', 'solidity', 'web3'
  ];

  const matchedKeywords = new Set();
  for (const skill of knownKeywords) {
    // Regex word boundary matching
    const skillRegex = new RegExp(`\\b${skill.replace(/[.+]/g, '\\$&')}\\b`, 'i');
    if (skillRegex.test(lowerText)) {
      matchedKeywords.add(skill.charAt(0).toUpperCase() + skill.slice(1));
    }
  }

  // If no predefined role was matched, infer from top matched skill or degree/background
  if (!detectedRole) {
    if (matchedKeywords.has('React') || matchedKeywords.has('Javascript') || matchedKeywords.has('Next.js')) {
      detectedRole = 'Frontend Developer';
    } else if (matchedKeywords.has('Python') || matchedKeywords.has('Machine Learning')) {
      detectedRole = 'AI / Python Developer';
    } else if (matchedKeywords.has('Node.js') || matchedKeywords.has('Express') || matchedKeywords.has('Postgresql')) {
      detectedRole = 'Backend Developer';
    } else {
      detectedRole = 'Software Engineer';
    }
  }

  // If few keywords matched, extract top prominent words
  if (matchedKeywords.size < 3) {
    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'from', 'have', 'been', 'year', 'years', 'student',
      'university', 'college', 'looking', 'seeking', 'working', 'worked', 'built',
      'experience', 'knowledge', 'proficient', 'project', 'projects', 'skills', 'about',
      'that', 'this', 'will', 'good', 'strong', 'degree', 'internship', 'summer', 'role'
    ]);

    const words = cleanText
      .replace(/[^a-zA-Z0-9+#]/g, ' ')
      .split(/\s+/)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 2 && !stopWords.has(w));

    for (const w of words) {
      if (matchedKeywords.size >= 5) break;
      matchedKeywords.add(w.charAt(0).toUpperCase() + w.slice(1));
    }
  }

  return {
    roleTitle: detectedRole,
    keywords: Array.from(matchedKeywords).slice(0, 6)
  };
}

/**
 * POST /api/search
 * Core endpoint: parses profile, scrapes via TinyFish agent, and returns normalized jobs.
 */
app.post('/api/search', async (req, res) => {
  try {
    const { profileText, jobType = 'Both', location = '', isRemote = false } = req.body;

    if (!profileText || typeof profileText !== 'string' || profileText.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please enter your profile information or skills.'
      });
    }

    // Step 2a: Extract keywords & role title
    const { roleTitle, keywords } = extractProfileDetails(profileText);

    // Step 2b & 2c: Call TinyFish Web Agent scraper and normalize results
    const jobs = await scrapeJobs({
      keywords,
      roleTitle,
      jobType,
      location,
      isRemote: Boolean(isRemote)
    });

    return res.json({
      success: true,
      extracted: {
        roleTitle,
        keywords,
        jobType,
        location: isRemote ? 'Remote' : (location || 'Any Location')
      },
      count: jobs.length,
      jobs
    });
  } catch (error) {
    console.error('Job search failed:', error.message);

    // Friendly error messaging for missing or invalid keys
    const isKeyError = error.message.includes('TINYFISH_API_KEY') || error.message.includes('API key');
    const statusCode = isKeyError ? 401 : 500;

    return res.status(statusCode).json({
      success: false,
      error: error.message,
      isKeyError
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  const hasKey = Boolean(process.env.TINYFISH_API_KEY && process.env.TINYFISH_API_KEY !== 'your_key_here');
  res.json({
    status: 'ok',
    tinyFishKeyConfigured: hasKey,
    timestamp: new Date().toISOString()
  });
});

// Fallback to index.html for single-page routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 JobScout server running at http://localhost:${PORT}`);
  if (!process.env.TINYFISH_API_KEY || process.env.TINYFISH_API_KEY === 'your_key_here') {
    console.warn(`⚠️  NOTICE: TINYFISH_API_KEY is not configured yet. Add your key to .env to enable live scraping.`);
  }
});

# JobScout 🔍

A clean, minimalist web application that turns raw candidate profile text, resumes, and skill summaries into matched, live job and internship opportunities using the **TinyFish Web Agent & Scraping API**.

---

## ✨ Features

- **Raw Text Ingestion**: Simply paste unstructured text (skills, university coursework, projects, or resume snippets)—no tedious profile building required.
- **Automatic Keyword & Role Detection**: Lightweight backend extraction detects target roles (e.g. Frontend, Backend, Machine Learning, Data) and prominent skills without heavy NLP dependencies.
- **Autonomous Web Scraping via TinyFish**: Dispatches an AI agent to scout live listings across major public job boards (LinkedIn, Indeed, Internshala, Wellfound, Google Jobs) using natural language instructions.
- **Smart Result Normalization**: Parses and structures messy web responses into uniform job cards with title, company, location, type badge, description, and direct application links.
- **Modern Minimal UI**: Built with Inter typography, clean whitespace, subtle shadows, fluid responsive layouts, and automatic dark-mode support.
- **Zero Build Step**: Native Node.js + Express backend with vanilla HTML, CSS, and JS served from `/public`.

---

## 📁 File Structure

```text
jobscout/
├── .env.example        # Environment variable template
├── .gitignore          # Git ignore for node_modules and .env
├── package.json        # Project metadata and start scripts
├── README.md           # Documentation and setup instructions
├── server.js           # Express API server & keyword extraction
├── tinyfish.js         # Dedicated TinyFish Web Agent API client
└── public/
    ├── index.html      # Semantic HTML UI layout
    ├── style.css       # Clean, modern, responsive styling
    └── app.js          # Vanilla JavaScript interaction logic
```

---

## 🚀 Quick Setup & Run

### 1. Clone or Navigate to Directory
```bash
cd jobscout
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Your TinyFish API Key
Copy the example environment file and add your TinyFish API key:
```bash
# On Linux / macOS / Git Bash:
cp .env.example .env

# On Windows PowerShell:
Copy-Item .env.example .env
```

Open `.env` and paste your key from [TinyFish API Keys](https://agent.tinyfish.ai/api-keys):
```env
TINYFISH_API_KEY=sk-tinyfish-your_actual_key_here
PORT=3000
```

### 4. Start the Application
```bash
npm start
```
Or for development with automatic reload (Node 18+):
```bash
npm run dev
```

### 5. Open in Browser
Visit [http://localhost:3000](http://localhost:3000) to start scouting opportunities!

---

## 🛠️ How It Works Under the Hood

1. **Frontend**: Collects your raw background text, opportunity type filter (*Internship*, *Full-time*, or *Both*), and location preferences.
2. **Backend Keyword Extractor (`server.js`)**: Identifies core technical competencies (e.g. *React, Node.js, Python, PostgreSQL*) and role titles (*Frontend Developer, Software Engineer, Data Scientist*).
3. **TinyFish Web Agent (`tinyfish.js`)**: Executes a `POST` request to `https://agent.tinyfish.ai/v1/automation/run` with the target search parameters and natural language extraction goal. The autonomous agent browses live listings and extracts the results.
4. **Normalizer**: Ensures results conform to `{ title, company, location, type, link, description }`, parsing structured JSON or unstructured markdown output if needed.
5. **Presentation**: The frontend renders clean, interactive cards with one-click "Apply" links opening the original source.

---

## 🛡️ Security

The `TINYFISH_API_KEY` is securely stored on the server side and loaded via `dotenv`. It is never bundled, passed to, or exposed in client-side code.

---

## 📄 License

MIT

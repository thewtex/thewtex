// Generates a "Top Contributed Repos" SVG card using GitHub's GraphQL API.
// Mimics the style of github-contributor-stats.vercel.app with a dark theme.
//
// Usage: GITHUB_TOKEN=<token> node generate-contributor-stats.js <username> [limit] [output-path]

const https = require("https");
const fs = require("fs");

const USERNAME = process.argv[2] || process.env.GITHUB_REPOSITORY_OWNER || "thewtex";
const LIMIT = parseInt(process.argv[3] || "5", 10);
const OUTPUT = process.argv[4] || "profile/contributor-stats.svg";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("Error: GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

// Query contributions for a single year window
function queryContributions(login, from, to) {
  const query = `query {
    user(login: "${login}") {
      contributionsCollection(from: "${from}", to: "${to}") {
        commitContributionsByRepository(maxRepositories: 100) {
          repository {
            nameWithOwner
            url
            stargazerCount
            isPrivate
          }
          contributions {
            totalCount
          }
        }
      }
    }
  }`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request(
      {
        hostname: "api.github.com",
        path: "/graphql",
        method: "POST",
        headers: {
          Authorization: `bearer ${TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "github-contributor-stats-generator",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.errors) {
              reject(new Error(JSON.stringify(parsed.errors)));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Get the user's account creation year
function queryUserCreatedAt(login) {
  const query = `query { user(login: "${login}") { createdAt } }`;
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query });
    const req = https.request(
      {
        hostname: "api.github.com",
        path: "/graphql",
        method: "POST",
        headers: {
          Authorization: `bearer ${TOKEN}`,
          "Content-Type": "application/json",
          "User-Agent": "github-contributor-stats-generator",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed.data.user.createdAt);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function getRank(stars) {
  if (stars >= 10000) return { label: "S+", color: "#e4b669" };
  if (stars >= 1000) return { label: "S", color: "#e4b669" };
  if (stars >= 500) return { label: "A+", color: "#69c46d" };
  if (stars >= 100) return { label: "A", color: "#69c46d" };
  if (stars >= 50) return { label: "B+", color: "#6cb6ff" };
  return { label: "B", color: "#6cb6ff" };
}

function escapeXml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(n) {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function generateSvg(repos) {
  const ROW_HEIGHT = 70;
  const PADDING_TOP = 35;
  const PADDING_BOTTOM = 20;
  const WIDTH = 450;
  const HEIGHT = PADDING_TOP + repos.length * ROW_HEIGHT + PADDING_BOTTOM;

  const rows = repos
    .map((repo, i) => {
      const y = PADDING_TOP + i * ROW_HEIGHT;
      const rank = getRank(repo.stars);
      const name = escapeXml(repo.nameWithOwner);
      // Truncate long repo names
      const displayName = name.length > 38 ? name.slice(0, 35) + "..." : name;

      return `
    <g transform="translate(0, ${y})">
      <!-- Rank badge -->
      <g transform="translate(20, 8)">
        <rect width="40" height="26" rx="13" fill="${rank.color}" opacity="0.15"/>
        <text x="20" y="17" text-anchor="middle" fill="${rank.color}" font-size="12" font-weight="700" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">${rank.label}</text>
      </g>
      <!-- Repo name -->
      <text x="72" y="22" fill="#c9d1d9" font-size="14" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">${displayName}</text>
      <!-- Stars -->
      <g transform="translate(72, 36)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="#8b949e">
          <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
        </svg>
        <text x="18" y="11" fill="#8b949e" font-size="12" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">${formatNumber(repo.stars)}</text>
      </g>
      <!-- Contributions -->
      <g transform="translate(160, 36)">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="#8b949e">
          <path d="M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5A.75.75 0 017.75 4z"/>
        </svg>
        <text x="18" y="11" fill="#8b949e" font-size="12" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">${formatNumber(repo.contributions)} contributions</text>
      </g>
      <!-- Divider -->
      ${i < repos.length - 1 ? `<line x1="20" y1="62" x2="${WIDTH - 20}" y2="62" stroke="#21262d" stroke-width="1"/>` : ""}
    </g>`;
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <style>
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(5px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .card { animation: fadeIn 0.8s ease-in-out; }
  </style>
  <rect width="${WIDTH}" height="${HEIGHT}" rx="6" fill="#0d1117" stroke="#30363d" stroke-width="1"/>
  <text x="${WIDTH / 2}" y="24" text-anchor="middle" fill="#c9d1d9" font-size="14" font-weight="600" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">Top Contributed Repositories</text>
  <g class="card">
    ${rows}
  </g>
</svg>`;
}

async function main() {
  console.log(`Fetching contribution data for ${USERNAME}...`);

  // Get user creation date to determine year range
  const createdAt = await queryUserCreatedAt(USERNAME);
  const startYear = new Date(createdAt).getFullYear();
  const currentYear = new Date().getFullYear();

  // Aggregate contributions across all years
  const repoMap = new Map(); // nameWithOwner -> { contributions, stars, url }

  for (let year = startYear; year <= currentYear; year++) {
    const from = `${year}-01-01T00:00:00Z`;
    const to = `${Math.min(year + 1, currentYear + 1)}-01-01T00:00:00Z`;

    console.log(`  Querying ${year}...`);
    try {
      const result = await queryContributions(USERNAME, from, to);
      const repos =
        result.data.user.contributionsCollection
          .commitContributionsByRepository || [];

      for (const entry of repos) {
        if (entry.repository.isPrivate) continue;
        const key = entry.repository.nameWithOwner;
        const existing = repoMap.get(key);
        if (existing) {
          existing.contributions += entry.contributions.totalCount;
        } else {
          repoMap.set(key, {
            nameWithOwner: key,
            url: entry.repository.url,
            stars: entry.repository.stargazerCount,
            contributions: entry.contributions.totalCount,
          });
        }
      }
    } catch (err) {
      console.warn(`  Warning: failed to fetch ${year}: ${err.message}`);
    }
  }

  // Sort by contributions descending, take top N
  const sorted = [...repoMap.values()]
    .sort((a, b) => b.contributions - a.contributions)
    .slice(0, LIMIT);

  if (sorted.length === 0) {
    console.warn("No contributions found. Generating placeholder SVG.");
    sorted.push({
      nameWithOwner: "No contributions found",
      stars: 0,
      contributions: 0,
    });
  }

  console.log(`Top ${sorted.length} repos by contributions:`);
  for (const r of sorted) {
    console.log(
      `  ${r.nameWithOwner}: ${r.contributions} contributions, ${r.stars} stars`
    );
  }

  const svg = generateSvg(sorted);

  // Ensure output directory exists
  const dir = OUTPUT.split("/").slice(0, -1).join("/");
  if (dir) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(OUTPUT, svg);
  console.log(`SVG written to ${OUTPUT}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

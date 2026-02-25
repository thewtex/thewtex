// Generates a streak stats SVG card using GitHub's GraphQL API.
// Queries ALL years from account creation to present (replicating
// DenverCoder1/github-readme-streak-stats behavior) so that
// "Total Contributions" reflects the full account lifetime.
//
// Usage: GITHUB_TOKEN=<token> node generate-streak-stats.js <username> [output-path]

const https = require("https");
const fs = require("fs");

const USERNAME = process.argv[2] || process.env.GITHUB_REPOSITORY_OWNER || "thewtex";
const OUTPUT = process.argv[3] || "profile/streak.svg";
const TOKEN = process.env.GITHUB_TOKEN;

if (!TOKEN) {
  console.error("Error: GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

function graphql(query) {
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
          "User-Agent": "github-streak-stats-generator",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.errors) reject(new Error(JSON.stringify(parsed.errors)));
            else resolve(parsed);
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

// Fetch contribution days for a single year window
async function fetchYear(login, from, to) {
  const result = await graphql(`query {
    user(login: "${login}") {
      contributionsCollection(from: "${from}", to: "${to}") {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              date
            }
          }
        }
      }
    }
  }`);
  const weeks =
    result.data.user.contributionsCollection.contributionCalendar.weeks;
  const days = [];
  for (const week of weeks) {
    for (const day of week.contributionDays) {
      days.push({ date: day.date, count: day.contributionCount });
    }
  }
  return days;
}

// Fetch account creation date
async function fetchCreatedAt(login) {
  const result = await graphql(
    `query { user(login: "${login}") { createdAt } }`
  );
  return result.data.user.createdAt;
}

function formatDate(dateStr) {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const d = new Date(dateStr + "T00:00:00Z");
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function formatDateShort(dateStr) {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const d = new Date(dateStr + "T00:00:00Z");
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function formatNumber(n) {
  return n.toLocaleString("en-US");
}

function computeStreaks(days) {
  // Sort by date ascending
  days.sort((a, b) => (a.date < b.date ? -1 : 1));

  const today = new Date().toISOString().slice(0, 10);

  let totalContributions = 0;
  let currentStreak = 0;
  let currentStreakStart = null;
  let currentStreakEnd = null;
  let longestStreak = 0;
  let longestStreakStart = null;
  let longestStreakEnd = null;

  // Track running streak for longest calculation
  let runStreak = 0;
  let runStart = null;

  // Find first contribution date
  let firstContribDate = null;

  for (const day of days) {
    totalContributions += day.count;

    if (day.count > 0) {
      if (!firstContribDate) firstContribDate = day.date;

      if (runStreak === 0) {
        runStart = day.date;
      }
      runStreak++;

      if (runStreak > longestStreak) {
        longestStreak = runStreak;
        longestStreakStart = runStart;
        longestStreakEnd = day.date;
      }
    } else {
      runStreak = 0;
      runStart = null;
    }
  }

  // Current streak: count consecutive days with contributions ending at
  // today or yesterday (if today has no contributions yet)
  currentStreak = 0;
  currentStreakStart = null;
  currentStreakEnd = null;

  for (let i = days.length - 1; i >= 0; i--) {
    const day = days[i];
    // Skip today if no contributions yet (the day isn't over)
    if (i === days.length - 1 && day.date === today && day.count === 0) {
      continue;
    }
    if (day.count > 0) {
      currentStreak++;
      currentStreakStart = day.date;
      if (!currentStreakEnd) currentStreakEnd = day.date;
    } else {
      break;
    }
  }

  return {
    totalContributions,
    currentStreak,
    currentStreakStart,
    currentStreakEnd,
    longestStreak,
    longestStreakStart,
    longestStreakEnd,
    firstContribDate: firstContribDate || days[0]?.date || today,
  };
}

function generateSvg(stats) {
  const WIDTH = 495;
  const HEIGHT = 195;
  const COL_WIDTH = WIDTH / 3;

  // Theme: dark (matching the original card)
  const BG = "#151515";
  const BORDER = "#E4E2E2";
  const TEXT_PRIMARY = "#FEFEFE";
  const TEXT_SECONDARY = "#9E9E9E";
  const ACCENT = "#FB8C00";

  const currentRange =
    stats.currentStreak > 0 && stats.currentStreakStart && stats.currentStreakEnd
      ? `${formatDateShort(stats.currentStreakStart)} - ${formatDateShort(stats.currentStreakEnd)}`
      : "No active streak";

  const longestRange =
    stats.longestStreak > 0 &&
    stats.longestStreakStart &&
    stats.longestStreakEnd
      ? `${formatDateShort(stats.longestStreakStart)} - ${formatDateShort(stats.longestStreakEnd)}`
      : "N/A";

  const totalRange = `${formatDate(stats.firstContribDate)} - Present`;

  // Fire icon path (from DenverCoder1's original)
  const firePath = `M 1.5 0.67 C 1.5 0.67 2.24 3.32 2.24 5.47 C 2.24 7.53 0.89 9.2 -1.17 9.2 C -3.23 9.2 -4.79 7.53 -4.79 5.47 L -4.76 5.11 C -6.78 7.51 -8 10.62 -8 13.99 C -8 18.41 -4.42 22 0 22 C 4.42 22 8 18.41 8 13.99 C 8 8.6 5.41 3.79 1.5 0.67 Z M -0.29 19 C -2.07 19 -3.51 17.6 -3.51 15.86 C -3.51 14.24 -2.46 13.1 -0.7 12.74 C 1.07 12.38 2.9 11.53 3.92 10.16 C 4.31 11.45 4.51 12.81 4.51 14.2 C 4.51 16.85 2.36 19 -0.29 19 Z`;

  return `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'
      style='isolation: isolate' viewBox='0 0 ${WIDTH} ${HEIGHT}' direction='ltr'>
  
    <style>
      @keyframes currstreak {
        0% { font-size: 3px; opacity: 0.2; }
        80% { font-size: 34px; opacity: 1; }
        100% { font-size: 28px; opacity: 1; }
      }
      @keyframes fadein {
        0% { opacity: 0; }
        100% { opacity: 1; }
      }
    </style>
  <defs>
    <clipPath id='outer_rectangle'>
      <rect width='${WIDTH}' height='${HEIGHT}' rx='4.5'/>
    </clipPath>
  </defs>
  <g clip-path='url(#outer_rectangle)'>
    <g style='isolation: isolate'>
      <rect x="0.5" y="0.5" rx="4.5" ry="4.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" fill="${BG}" stroke="${BORDER}" stroke-width="1"/>
    </g>
    <defs>
    <mask id='ringMask'>
      <rect x='0' y='0' width='${WIDTH}' height='${HEIGHT}' fill='white'/>
      <!-- Fire icon cutout -->
      <ellipse cx='${COL_WIDTH * 1.5}' cy='36' rx='13' ry='18' fill='black'/>
    </mask>
    </defs>
<line x1='${COL_WIDTH}' y1='28' x2='${COL_WIDTH}' y2='170' vector-effect='non-scaling-stroke' stroke-width='1' stroke='${BORDER}' stroke-linejoin='miter' stroke-linecap='square' stroke-miterlimit='3'/>
<line x1='${COL_WIDTH * 2}' y1='28' x2='${COL_WIDTH * 2}' y2='170' vector-effect='non-scaling-stroke' stroke-width='1' stroke='${BORDER}' stroke-linejoin='miter' stroke-linecap='square' stroke-miterlimit='3'/>
<!-- Total Contributions -->
<text x='${COL_WIDTH * 0.5}' y='79' stroke-width='0' text-anchor='middle' fill='${TEXT_PRIMARY}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='28px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.5s'>${formatNumber(stats.totalContributions)}</text>
<text x='${COL_WIDTH * 0.5}' y='130' stroke-width='0' text-anchor='middle' fill='${TEXT_PRIMARY}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.65s'>Total Contributions</text>
<text x='${COL_WIDTH * 0.5}' y='158' stroke-width='0' text-anchor='middle' fill='${TEXT_SECONDARY}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.8s'>${totalRange}</text>
<!-- Current Streak ring -->
<g style='animation: fadein 0.5s linear forwards 0.4s; opacity: 0'>
    <circle cx='${COL_WIDTH * 1.5}' cy='72' r='40' fill='none' stroke='${ACCENT}' stroke-width='5' stroke-linecap='round' mask='url(#ringMask)'/>
</g>
<!-- Fire icon -->
<g style='animation: fadein 0.5s linear forwards 0.6s; opacity: 0'>
    <g transform='translate(${COL_WIDTH * 1.5}, 18)'>
      <path d='${firePath}' fill='${ACCENT}'/>
    </g>
</g>
<!-- Current Streak -->
<text x='${COL_WIDTH * 1.5}' y='79' stroke-width='0' text-anchor='middle' fill='${TEXT_PRIMARY}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='28px' font-style='normal' style='animation: currstreak 0.6s linear forwards'>${formatNumber(stats.currentStreak)}</text>
<text x='${COL_WIDTH * 1.5}' y='130' stroke-width='0' text-anchor='middle' fill='${ACCENT}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.9s'>Current Streak</text>
<text x='${COL_WIDTH * 1.5}' y='158' stroke-width='0' text-anchor='middle' fill='${TEXT_SECONDARY}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.9s'>${currentRange}</text>
<!-- Longest Streak -->
<text x='${COL_WIDTH * 2.5}' y='79' stroke-width='0' text-anchor='middle' fill='${TEXT_PRIMARY}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='700' font-size='28px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.5s'>${formatNumber(stats.longestStreak)}</text>
<text x='${COL_WIDTH * 2.5}' y='130' stroke-width='0' text-anchor='middle' fill='${TEXT_PRIMARY}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='14px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.65s'>Longest Streak</text>
<text x='${COL_WIDTH * 2.5}' y='158' stroke-width='0' text-anchor='middle' fill='${TEXT_SECONDARY}' stroke='none' font-family='"Segoe UI", Ubuntu, sans-serif' font-weight='400' font-size='12px' font-style='normal' style='opacity: 0; animation: fadein 0.5s linear forwards 0.8s'>${longestRange}</text>
  </g>
</svg>`;
}

async function main() {
  console.log(`Fetching streak data for ${USERNAME}...`);

  // Get account creation year
  const createdAt = await fetchCreatedAt(USERNAME);
  const startYear = new Date(createdAt).getFullYear();
  const currentYear = new Date().getFullYear();

  console.log(
    `Account created: ${createdAt} — fetching ${currentYear - startYear + 1} years of data`
  );

  // Fetch all years
  const allDays = [];
  for (let year = startYear; year <= currentYear; year++) {
    const from = `${year}-01-01T00:00:00Z`;
    const to =
      year === currentYear
        ? new Date().toISOString()
        : `${year + 1}-01-01T00:00:00Z`;

    console.log(`  Fetching ${year}...`);
    try {
      const days = await fetchYear(USERNAME, from, to);
      allDays.push(...days);
    } catch (err) {
      console.warn(`  Warning: failed to fetch ${year}: ${err.message}`);
    }
  }

  // Deduplicate days (year boundaries may overlap)
  const dayMap = new Map();
  for (const day of allDays) {
    const existing = dayMap.get(day.date);
    if (!existing || day.count > existing.count) {
      dayMap.set(day.date, day);
    }
  }
  const uniqueDays = [...dayMap.values()];

  console.log(`  Total unique days: ${uniqueDays.length}`);

  const stats = computeStreaks(uniqueDays);

  console.log(`  Total Contributions: ${formatNumber(stats.totalContributions)}`);
  console.log(`  Current Streak: ${stats.currentStreak}`);
  console.log(`  Longest Streak: ${stats.longestStreak}`);

  const svg = generateSvg(stats);

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

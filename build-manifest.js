const fs = require('fs');
const path = require('path');

// Full port of parseTags from browser code
function parseTags(str) {
  const parts = str.split(':').map(p => p.trim()).filter(Boolean);
  const tags = [];
  for (const part of parts) {
    if (part.includes(',')) {
      const commaParts = part.split(',').map(p => p.trim()).filter(Boolean);
      tags.push(...commaParts);
    } else if (part) {
      tags.push(part);
    }
  }
  return tags;
}

// Full port of parseFolder from browser JS
function parseFolder(entry) {
  const str = (typeof entry === 'string') ? entry : (entry.label || entry.name || '');
  const firstColon = str.indexOf(':');
  let name = str;
  let tags = [];

  if (firstColon !== -1) {
    name = str.substring(0, firstColon).trim();
    const tagStr = str.substring(firstColon + 1);
    tags = parseTags(tagStr);
  }

  let hiddenLevel = 0;
  for (let i = 1; i <= 6; i++) {
    if (tags.includes('hidden' + i)) {
      hiddenLevel = i;
      break;
    }
  }
  if (tags.includes('hidden') && hiddenLevel === 0) {
    hiddenLevel = 1;
  }

  return { name, hiddenLevel };
}

// Full port of parseFile from browser JS
function parseFile(entry) {
  const str = (typeof entry === 'string') ? entry : (entry.name || entry.label || '');
  const firstColon = str.indexOf(':');
  let name = str;
  let tags = [];

  if (firstColon !== -1) {
    name = str.substring(0, firstColon).trim();
    const tagStr = str.substring(firstColon + 1);
    tags = parseTags(tagStr);
  }

  let hiddenLevel = 0;
  for (let i = 1; i <= 6; i++) {
    if (tags.includes('hidden' + i)) {
      hiddenLevel = i;
      break;
    }
  }
  if (tags.includes('hidden') && hiddenLevel === 0) {
    hiddenLevel = 1;
  }

  let lockedLevel = 0;
  for (let i = 1; i <= 6; i++) {
    if (tags.includes('locked' + i)) {
      lockedLevel = i;
      break;
    }
  }
  if (tags.includes('locked') && lockedLevel === 0) {
    lockedLevel = 1;
  }

  return { name, hiddenLevel, lockedLevel };
}

// Global stats counters
const stats = {
  totalFolders: 0,
  totalFiles: 0,
  fileTypes: { txt: 0, md: 0, png: 0, mp3: 0 },
  hiddenFolders: { total: 0, levels: [0, 0, 0, 0, 0, 0, 0] },  // levels[1] = level1 (6), etc.
  hiddenFiles: { total: 0, levels: [0, 0, 0, 0, 0, 0, 0] },
  lockedFiles: { total: 0, levels: [0, 0, 0, 0, 0, 0, 0] }
};

function scanDir(dir) {
  stats.totalFolders++;  // Count every folder visited

  const res = { name: path.basename(dir), folders: [], files: [] };

  // Read folders.json if it exists and is valid
  const foldersPath = path.join(dir, 'folders.json');
  if (fs.existsSync(foldersPath)) {
    try {
      const content = fs.readFileSync(foldersPath, 'utf8').trim();
      if (content) {
        const foldersJson = JSON.parse(content);
        if (Array.isArray(foldersJson)) {
          foldersJson.forEach(entry => {
            const parsed = parseFolder(entry);
            const name = parsed.name;
            const subDir = path.join(dir, name);
            if (fs.existsSync(subDir) && fs.statSync(subDir).isDirectory()) {
              if (parsed.hiddenLevel > 0) {
                stats.hiddenFolders.total++;
                stats.hiddenFolders.levels[parsed.hiddenLevel]++;
              }
              res.folders.push(scanDir(subDir));
            }
          });
        }
      }
    } catch (err) {
      console.warn(`Warning: Invalid or empty folders.json in ${dir} → skipping (${err.message})`);
    }
  }

  // Read files.json if it exists and is valid
  const filesPath = path.join(dir, 'files.json');
  if (fs.existsSync(filesPath)) {
    try {
      const content = fs.readFileSync(filesPath, 'utf8').trim();
      if (content) {
        const filesJson = JSON.parse(content);
        if (Array.isArray(filesJson)) {
          res.files = filesJson;  // keep full entries with :tags
          filesJson.forEach(entry => {
            const parsed = parseFile(entry);
            stats.totalFiles++;
            
            // Count file types (based on extension after parsing name)
            const ext = parsed.name.split('.').pop().toLowerCase();
            if (stats.fileTypes.hasOwnProperty(ext)) {
              stats.fileTypes[ext]++;
            }
            
            // Hidden files
            if (parsed.hiddenLevel > 0) {
              stats.hiddenFiles.total++;
              stats.hiddenFiles.levels[parsed.hiddenLevel]++;
            }
            
            // Locked files
            if (parsed.lockedLevel > 0) {
              stats.lockedFiles.total++;
              stats.lockedFiles.levels[parsed.lockedLevel]++;
            }
          });
        }
      }
    } catch (err) {
      console.warn(`Warning: Invalid or empty files.json in ${dir} → skipping (${err.message})`);
    }
  }

  // Sort for consistency
  res.folders.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  res.files.sort();

  return res;
}

function printStats() {
  console.log('\n=== Build Statistics ===');
  console.log(`Total folders: ${stats.totalFolders}`);
  console.log(`Total files: ${stats.totalFiles}`);
  console.log('Files by type:');
  let hasTypes = false;
  for (const [type, count] of Object.entries(stats.fileTypes)) {
    if (count > 0) {
      console.log(`  - ${type.toUpperCase()}: ${count}`);
      hasTypes = true;
    }
  }
  if (!hasTypes) console.log('  (none found)');

  // Helper to print non-zero levels
  function printLevels(title, data, prefix) {
    if (data.total === 0) return;

    console.log(`\n${title} total: ${data.total}`);
    const levelMap = {1:6, 2:9, 3:10, 4:11, 5:12, 6:13};

    for (let i = 1; i <= 6; i++) {
      if (data.levels[i] > 0) {
        console.log(`  - Level ${levelMap[i]} (${prefix}${i}): ${data.levels[i]}`);
      }
    }
  }

  printLevels('Hidden folders', stats.hiddenFolders, 'hidden');
  printLevels('Hidden files', stats.hiddenFiles, 'hidden');
  printLevels('Locked files', stats.lockedFiles, 'locked');

  console.log('========================\n');
}

function main() {
  const base = path.join(__dirname, 'db');
  if (!fs.existsSync(base)) {
    console.error('db folder not found at', base);
    process.exit(1);
  }

  console.log('Scanning db folder...');
  const manifest = scanDir(base);
  const outPath = path.join(__dirname, 'db-manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('Wrote', outPath);

  printStats();
}

if (require.main === module) main();
const fs = require('fs');
const path = require('path');

function scanDir(dir){
  const res = { name: path.basename(dir), folders: [], files: [] };
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for(const e of entries){
    if(e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if(e.isDirectory()){
      res.folders.push(scanDir(full));
    } else if(e.isFile()){
      res.files.push(e.name);
    }
  }
  // sort for deterministic output
  res.folders.sort((a,b)=>a.name.localeCompare(b.name));
  res.files.sort();
  return res;
}

function main(){
  const base = path.join(__dirname, '..', 'db');
  if(!fs.existsSync(base)){
    console.error('db folder not found at', base);
    process.exit(1);
  }
  const manifest = scanDir(base);
  const outPath = path.join(__dirname, '..', 'db-manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log('Wrote', outPath);
}

if(require.main === module) main();

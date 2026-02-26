// script.js — unified UI & filesystem-driven manifest navigation
(function(){
  const params = new URLSearchParams(location.search);
  const rawPath = params.get('path') || '';
  const pathParts = rawPath ? rawPath.split('/').filter(Boolean) : [];
  const menuRoot = document.getElementById('menuList');
  let selected = 0;
  let mode = 'menu';
  let isSearchMode = false;
  let searchResults = [];
  let specialAccessLevel = 0;
  let isCommandMode = false;
  const navigationHistory = {};
  const fileView = document.getElementById('fileView');
  const fileHeader = document.getElementById('fileHeader');
  const fileContent = document.getElementById('fileContent');
  let searchModal = null;
  let searchInput = null;
  let commandModal = null;
  let commandInput = null;
  // === FAST SEARCH INDEX ===
  let searchableFiles = [];   // flat list of all files (built once)
  let indexBuilt = false;

  const themeColors = { red:true, red2:true, red3:true, orange:true, yellow:true, green:true, cyan:true, blue:true, purple:true, pink:true, white:true };
  let currentTheme = 'green';

  const levelNames = {
    1: 'Level 6 Access',
    2: 'Level 9 Access', 
    3: 'Level 10 Access',
    4: 'Level 11 Access',
    5: 'Level 12 Access',
    6: 'Level 13 Access'
  };

  // Blur intensity for locked images (adjustable)
  const LOCKED_IMAGE_BLUR = 10;

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

  function parseFolder(entry){
    const str = (typeof entry === 'string') ? entry : (entry.label || entry.name || '');
    const firstColon = str.indexOf(':');
    let name = str;
    let tags = [];
    
    if (firstColon !== -1) {
      name = str.substring(0, firstColon).trim();
      const tagStr = str.substring(firstColon + 1);
      tags = parseTags(tagStr);
    }
    
    const theme = tags.find(t => themeColors[t.toLowerCase()])?.toLowerCase() || null;
    
    let hiddenLevel = 0;
    for(let i = 1; i <= 6; i++){
      if(tags.includes('hidden'+i)){
        hiddenLevel = i;
        break;
      }
    }
    if(tags.includes('hidden') && hiddenLevel === 0){
      hiddenLevel = 1;
    }
    
    const isHidden = hiddenLevel > 0;
    return { name, theme, isHidden, hiddenLevel };
  }

  function parseFile(entry){
    const str = typeof entry === 'string' ? entry : (entry.name || entry.label || '');
    const firstColon = str.indexOf(':');
    let name = str;
    let tags = [];
    
    if (firstColon !== -1) {
      name = str.substring(0, firstColon).trim();
      const tagStr = str.substring(firstColon + 1);
      tags = parseTags(tagStr);
    }
    
    let hiddenLevel = 0;
    for(let i = 1; i <= 6; i++){
      if(tags.includes('hidden'+i)){
        hiddenLevel = i;
        break;
      }
    }
    if(tags.includes('hidden') && hiddenLevel === 0){
      hiddenLevel = 1;
    }
    
    let lockedLevel = 0;
    for(let i = 1; i <= 6; i++){
      if(tags.includes('locked'+i)){
        lockedLevel = i;
        break;
      }
    }
    if(tags.includes('locked') && lockedLevel === 0){
      lockedLevel = 1;
    }
    
    const isHidden = hiddenLevel > 0;
    const isLocked = lockedLevel > 0;
    return { name, isHidden, hiddenLevel, isLocked, lockedLevel };
  }
  
  // Map hidden/locked level (1-6) to actual access level (6-13)
  function getActualAccessLevel(level) {
    if (level === 0) return 0;
    if (level === 1) return 6;
    if (level === 2) return 9;
    if (level === 3) return 10;
    if (level === 4) return 11;
    if (level === 5) return 12;
    if (level === 6) return 13;
    return level;
  }
  
  function formatHiddenLockedDisplay(hiddenLevel, lockedLevel) {
    let parts = [];
    if (hiddenLevel > 0) {
      const actualLevel = getActualAccessLevel(hiddenLevel);
      if (hiddenLevel === 6) {
        parts.push('<span class="file-hidden">H</span>');
      } else {
        parts.push('<span class="file-hidden">H' + actualLevel + '</span>');
      }
    }
    if (lockedLevel > 0) {
      const actualLevel = getActualAccessLevel(lockedLevel);
      if (lockedLevel === 6) {
        parts.push('<span class="file-locked">L</span>');
      } else {
        parts.push('<span class="file-locked">L' + actualLevel + '</span>');
      }
    }
    return parts.join(' ');
  }

  function applyTheme(theme){
    if(themeColors[theme]){ currentTheme = theme; document.body.className = 'database-page theme-' + theme; }
  }

  const soundSettings = { beep: { volume:0.4, playbackRate:2 }, blip:{ volume:0.7, playbackRate:1.3 } };
  function playSound(src, type){ try{ const a=new Audio(src); const s=soundSettings[type]||soundSettings.beep; a.volume=s.volume; a.playbackRate=s.playbackRate; a.play(); }catch(e){} }

  async function fetchJSON(path){
    try{ const r=await fetch(path); if(!r.ok)return null; return JSON.parse(await r.text()); }catch(e){return null;}
  }
  // =============================================================================
  // FAST SEARCH INDEX - built once on page load
  // =============================================================================
  async function buildSearchIndex() {
    if (indexBuilt) return;

    console.time('Build search index');
    searchableFiles = [];

    // 1. Try the super-fast manifest first (recommended)
    try {
      const manifest = await fetchJSON('db-manifest.json');
      if (manifest && manifest.name) {
        flattenManifest(manifest, '');
        indexBuilt = true;
        console.log(`✅ Search index ready — ${searchableFiles.length} files (from manifest)`);
        console.timeEnd('Build search index');
        return;
      }
    } catch(e) {}

    // 2. Fallback to old slow method if manifest doesn't exist yet
    console.warn('⚠️ db-manifest.json not found — using slower fallback');
    await getAllFilesForSearchFallback();
    indexBuilt = true;
    console.timeEnd('Build search index');
  }

  function flattenManifest(node, currentPath) {
    const base = currentPath ? currentPath + '/' : '';

    // Add files from this folder
    if (node.files && Array.isArray(node.files)) {
      for (const fileName of node.files) {
        const parsed = parseFile(fileName);
        searchableFiles.push({
          path: /* 'db/' + */ base + parsed.name,
          name: parsed.name,
          parsed: parsed,
          baseName: parsed.name.split('.')[0]   // for exact match without extension
        });
      }
    }

  // Recurse into subfolders
    if (node.folders && Array.isArray(node.folders)) {
      for (const folderNode of node.folders) {
        const folderName = folderNode.name || (typeof folderNode === 'string' ? folderNode : '');
        flattenManifest(folderNode, base + folderName);
      }
    }
  }

  // Rename your old function so we can keep it as fallback
  async function getAllFilesForSearchFallback() {
    const allFiles = [];
    const allFolders = [''];

    async function findFolders(basePath) {
      const foldersJson = await fetchJSON('db/' + basePath + 'folders.json');
      if (foldersJson && Array.isArray(foldersJson)) {
        for (const f of foldersJson) {
          const parsed = parseFolder(f);
          const newPath = basePath + parsed.name + '/';
          allFolders.push(newPath);
          await findFolders(newPath);
        }
      }
    }
    await findFolders('');

    for (const folder of allFolders) {
      const filesJson = await fetchJSON('db/' + folder + 'files.json');
      if (filesJson && Array.isArray(filesJson)) {
        for (const file of filesJson) {
          const parsed = parseFile(file);
          allFiles.push({
            path: 'db/' + folder + parsed.name,
            name: parsed.name,
            parsed: parsed
          });
        }
      }
    }
    searchableFiles = allFiles;   // store in the new flat list
  }

  async function loadFolderManifests(parts){
    const rel=parts.length?parts.join('/')+'/':'';
    const folders=await fetchJSON('db/'+rel+'folders.json');
    if(folders&&Array.isArray(folders)&&folders.length>0)return{type:'folders',data:folders};
    const files=await fetchJSON('db/'+rel+'files.json');
    if(files&&Array.isArray(files)&&files.length>0)return{type:'files',data:files};
    if(parts.length===0){
      const legacy=await fetchJSON('db/db.json');
      if(legacy&&legacy.items)return{type:'legacy',data:legacy};
    }
    return{type:'empty',data:null};
  }

  function clearMenu(){ menuRoot.innerHTML=''; }

  function updateSpecialAccessIndicator(){
    let indicator = document.getElementById('specialAccessIndicator');
    if(specialAccessLevel > 0){
      if(!indicator){
        indicator = document.createElement('div');
        indicator.id = 'specialAccessIndicator';
        indicator.className = 'special-access-indicator';
        document.body.appendChild(indicator);
      }
      indicator.textContent = levelNames[specialAccessLevel] || 'Special Access';
      indicator.style.display = 'block';
    } else {
      if(indicator){
        indicator.style.display = 'none';
      }
    }
  }

  function renderLockedFolder(folders, pathPartsLocal){
    clearMenu();
    if(pathPartsLocal.length>0){ 
      const li=document.createElement('li');
      li.className='menu-item';
      li.dataset.index=0;
      li.innerHTML='<span class="label">RETURN</span>';
      menuRoot.appendChild(li);
    }
    
    let visibleIndex = pathPartsLocal.length>0 ? 1 : 0;
    folders.forEach((f,i)=>{
      const parsed = parseFolder(f);
      if(parsed.isHidden && parsed.hiddenLevel > specialAccessLevel) return;
      
      const li=document.createElement('li');
      li.className='menu-item';
      li.dataset.index=visibleIndex;
      li.innerHTML='<span class="label">'+parsed.name+'/</span>';
      menuRoot.appendChild(li);
      visibleIndex++;
    });
    
    if(pathPartsLocal.length===0){
      const searchBtn = document.createElement('li');
      searchBtn.className = 'menu-item menu-search-btn';
      searchBtn.dataset.index = visibleIndex;
      searchBtn.innerHTML = '<span class="label">SEARCH</span>';
      menuRoot.appendChild(searchBtn);
    }
    
    document.body.classList.add('locked');
    document.body.classList.remove('scrolling');
    updateHighlight();
  }

  function renderScrollFiles(files, pathPartsLocal, showCount){
    clearMenu();
    document.body.classList.remove('locked');
    document.body.classList.add('scrolling');
    
    if(showCount !== false && files && files.length > 0){
      const container = document.querySelector('.menu-root');
      if(container){
        const oldCount = container.querySelector('.result-count');
        if(oldCount) oldCount.remove();
        
        const countDiv = document.createElement('div');
        countDiv.className = 'result-count';
        countDiv.textContent = files.length + ' result' + (files.length !== 1 ? 's' : '') + ' found.';
        container.insertBefore(countDiv, menuRoot);
      }
    }
    
    const items = files || [];
    const slots = 9;
    const center = Math.floor(slots/2);
    for(let s=0; s<slots; s++){
      const idx = selected + (s - center);
      const li = document.createElement('li');
      li.className = 'menu-item';
      li.dataset.index = idx;
      const dist = Math.abs(idx - selected);
      if(idx < 0 || idx >= items.length){ 
        li.classList.add('empty'); 
        li.appendChild(document.createElement('span')); 
        if(dist>=1 && dist<=4) li.classList.add('dim-'+dist); 
      }else{ 
        const entry = items[idx]; 
        const parsed = parseFile(entry);
        const span=document.createElement('span'); 
        span.className='label'; 
        
        // Show HxLx tags for hidden/locked files
        const hlDisplay = formatHiddenLockedDisplay(parsed.hiddenLevel, parsed.lockedLevel);
        if (hlDisplay) {
          span.innerHTML = parsed.name + ' ' + hlDisplay;
        } else {
          span.textContent = parsed.name; 
        }
        
        li.appendChild(span); 
        if(dist===0) li.classList.add('highlight'); 
        else if(dist<=4) li.classList.add('dim-'+dist); 
      }
      menuRoot.appendChild(li);
    }
  }

  function renderSearchResults(){
    clearMenu();
    document.body.classList.remove('locked');
    document.body.classList.add('scrolling');
    
    const container = document.querySelector('.menu-root');
    if(container){
      const oldCount = container.querySelector('.result-count');
      if(oldCount) oldCount.remove();
      
      const countDiv = document.createElement('div');
      countDiv.className = 'result-count';
      const resultCount = searchResults ? searchResults.length : 0;
      countDiv.textContent = resultCount + ' result' + (resultCount !== 1 ? 's' : '') + ' found.';
      container.insertBefore(countDiv, menuRoot);
    }
    
    const items = searchResults || [];
    const slots = 9;
    const center = Math.floor(slots/2);
    const totalItems = items.length + 1;
    
    for(let s=0; s<slots; s++){
      const idx = selected + (s - center);
      const li = document.createElement('li');
      li.className = 'menu-item';
      li.dataset.index = idx;
      const dist = Math.abs(idx - selected);
      
      if(idx < 0 || idx >= totalItems){ 
        li.classList.add('empty'); 
        li.appendChild(document.createElement('span')); 
        if(dist>=1 && dist<=4) li.classList.add('dim-'+dist); 
      }else if(idx === 0){
        li.innerHTML = '<span class="label">RETURN</span>';
        if(dist===0) li.classList.add('highlight'); 
        else if(dist<=4) li.classList.add('dim-'+dist);
      }else{
        const itemIdx = idx - 1;
        if(itemIdx >= 0 && itemIdx < items.length){
          const item = items[itemIdx];
          const span = document.createElement('span');
          span.className = 'label';
          
          // Show HxLx tags for hidden/locked files in search results
          const parsed = item.parsed;
          if (parsed) {
            const hlDisplay = formatHiddenLockedDisplay(parsed.hiddenLevel, parsed.lockedLevel);
            if (hlDisplay) {
              span.innerHTML = item.name + ' ' + hlDisplay;
            } else {
              span.textContent = item.name;
            }
          } else {
            span.textContent = item.name;
          }
          li.appendChild(span);
        }
        if(dist===0) li.classList.add('highlight'); 
        else if(dist<=4) li.classList.add('dim-'+dist);
      }
      menuRoot.appendChild(li);
    }
  }

  function updateHighlight(){ 
    const items = menuRoot.querySelectorAll('.menu-item, .menu-search-btn'); 
    items.forEach(el=>{ 
      const idx = Number(el.dataset.index); 
      el.classList.remove('highlight','dim-1','dim-2','dim-3','dim-4'); 
      if(idx===selected) el.classList.add('highlight'); 
      else { 
        const dist=Math.abs(idx-selected); 
        if(dist>=1 && dist<=4) el.classList.add('dim-'+dist); 
        else el.style.opacity=''; 
      }
    });
  }

  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

  function getFileType(name){ 
    const m = name.split('.').pop().toLowerCase(); 
    if(['png','jpg','jpeg','gif','webp','svg'].includes(m)) return 'image';
    if(['mp3','wav','ogg','m4a','webm','flac'].includes(m)) return 'audio';
    if(['md'].includes(m)) return 'md';
    if(['txt','text'].includes(m)) return 'txt';
    return 'txt';
  }

  async function openSearchModal(){
    if(!searchModal) searchModal = document.getElementById('searchModal');
    if(!searchInput) searchInput = document.getElementById('searchInput');
    if(!searchModal || !searchInput) return;
    
    playSound('assets/sounds/blip.mp3', 'blip');
    searchModal.classList.add('visible');
    searchInput.value = '';
    searchInput.focus();
    // Pre-build index so first search is instant
    if (!indexBuilt) buildSearchIndex();
  }

  function closeSearchModal(){
    if(!searchModal) searchModal = document.getElementById('searchModal');
    if(!searchInput) searchInput = document.getElementById('searchInput');
    if(!searchModal || !searchInput) return;
    
    searchModal.classList.remove('visible');
    searchInput.value = '';
  }

  function openCommandModal(){
    if(!commandModal) commandModal = document.getElementById('commandModal');
    if(!commandInput) commandInput = document.getElementById('commandInput');
    if(!commandModal || !commandInput) return;
    
    playSound('assets/sounds/beep.mp3', 'beep');
    commandModal.classList.add('visible');
    commandInput.value = '';
    commandInput.focus();
    isCommandMode = true;
  }

  function closeCommandModal(){
    if(!commandModal) commandModal = document.getElementById('commandModal');
    if(!commandInput) commandInput = document.getElementById('commandInput');
    if(!commandModal || !commandInput) return;
    
    commandModal.classList.remove('visible');
    commandInput.value = '';
    isCommandMode = false;
  }

  function processCommand(cmd){
    const code = cmd.trim().toLowerCase();
    for(let i = 1; i <= 6; i++){
      if(code === 'code'+i){
        specialAccessLevel = i;
        updateSpecialAccessIndicator();
        playSound('assets/sounds/blip.mp3', 'blip');
        closeCommandModal();
        refresh();
        return true;
      }
    }
    closeCommandModal();
    return false;
  }

  function toggleSpecialAccess(){
    if(specialAccessLevel > 0){
      specialAccessLevel = 0;
      updateSpecialAccessIndicator();
      // Stay on current view instead of going back to initial menu
      if(isSearchMode){
        renderSearchResults();
        updateHighlight();
      } else if(mode === 'file'){
        // If in file viewer, close it and refresh the menu
        closeFileView();
        refresh();
      } else {
        refresh();
      }
    }
  }

  async function getAllFilesForSearch(){
    const allFiles = [];
    const allFolders = [''];
    
    async function findFolders(basePath){
      const foldersJson = await fetchJSON('db/'+basePath+'folders.json');
      if(foldersJson && Array.isArray(foldersJson)){
        for(const f of foldersJson){
          const parsed = parseFolder(f);
          const newPath = basePath + parsed.name + '/';
          allFolders.push(newPath);
          await findFolders(newPath);
        }
      }
    }
    await findFolders('');
    
    for(const folder of allFolders){
      const filesJson = await fetchJSON('db/'+folder+'files.json');
      if(filesJson && Array.isArray(filesJson)){
        for(const file of filesJson){
          const parsed = parseFile(file);
          allFiles.push({ path: folder + parsed.name, name: parsed.name, parsed: parsed });
        }
      }
    }
    
    return allFiles;
  }

  async function performSearch(query) {
  // Build index on first search (or if not ready)
    if (!indexBuilt) {
      await buildSearchIndex();
    }

    if (!query || query.trim() === '') {
      searchResults = [];
      return;
    }

    const searchTerm = query.trim().toLowerCase();

    searchResults = searchableFiles.filter(f =>
      f.baseName.toLowerCase() === searchTerm
    );
  }

  function enterSearchResults(){
    closeSearchModal();
    isSearchMode = true;
    selected = 0;
    mode = 'menu';
    renderSearchResults();
    updateHighlight();
  }

  function exitSearchMode(){
    isSearchMode = false;
    searchResults = [];
    while(pathParts.length > 0) pathParts.pop();
    selected = 0;
    applyTheme('green');
    refresh();
  }

  function openFileViewer(label, pathPartsLocal, fileEntry){
    mode='file'; 
    fileView.classList.add('visible'); 
    
    let isHidden = false;
    let hiddenLevel = 0;
    let isLocked = false;
    let lockedLevel = 0;
    
    if(fileEntry){
      isHidden = fileEntry.isHidden;
      hiddenLevel = fileEntry.hiddenLevel;
      isLocked = fileEntry.isLocked;
      lockedLevel = fileEntry.lockedLevel;
    } else {
      const parsed = parseFile(label);
      isHidden = parsed.isHidden;
      hiddenLevel = parsed.hiddenLevel;
      isLocked = parsed.isLocked;
      lockedLevel = parsed.lockedLevel;
    }
    
    // Show file path in header instead of hidden/locked info
    const displayPath = pathPartsLocal.length > 0 ? pathPartsLocal.join('/') + '/' : '';
    fileHeader.textContent = displayPath;
    
    const relPath = pathPartsLocal.length>0 ? pathPartsLocal.join('/') + '/' : '';
    const path = 'db/'+relPath+label;
    const filetype = getFileType(label);
    
    // Check if file is locked and user doesn't have access
    const hasLockedAccess = !isLocked || lockedLevel <= specialAccessLevel;
    
    if(filetype === 'image'){
      fileContent.innerHTML=''; 
      const container = document.createElement('div');
      container.className = 'locked-image-container';
      
      const img=document.createElement('img'); 
      img.src=path; 
      img.style.maxWidth='100%'; 
      img.style.maxHeight='100%'; 
      img.style.objectFit='contain'; 
      
      // If user has NO access, show blurred image with overlay on top
      if(!hasLockedAccess){
        img.style.filter = 'blur(' + LOCKED_IMAGE_BLUR + 'px)';
        
        // Add access denied overlay ON TOP of the image
        const accessLevelText = levelNames[lockedLevel] || 'Level ' + lockedLevel + ' Access';
        const overlay = document.createElement('div');
        overlay.className = 'access-denied-overlay';
        overlay.innerHTML = '<div class="access-denied-main">Access Denied</div><div class="access-denied-level">' + accessLevelText + ' Required</div>';
        container.appendChild(img);
        container.appendChild(overlay);
      } else {
        // User has access - show normal image
        container.appendChild(img);
      }
      
      fileContent.appendChild(container); 
      initializeScrollbar(); 
      updateScrollbarThumb();
    } else if(filetype === 'audio'){
      buildCustomAudioPlayer(label, path);
    } else if(filetype === 'md' || filetype === 'txt'){
      // For text files, check access
      if(!hasLockedAccess){
        const accessLevelText = levelNames[lockedLevel] || 'Level ' + lockedLevel + ' Access';
        fileContent.innerHTML = '<div class="access-denied"><div class="access-denied-main">Access Denied</div><div class="access-denied-level">' + accessLevelText + ' Required</div></div>';
        initializeScrollbar();
        return;
      }
      fetch(path).then(r=>{ 
        if(!r.ok) throw new Error('Failed to load'); 
        return r.text(); 
      }).then(text=>{ 
        if(filetype==='md') fileContent.innerHTML = renderMarkdown(text); 
        else fileContent.textContent = text; 
        fileContent.scrollTop=0; 
        initializeScrollbar(); 
        updateScrollbarThumb(); 
        fileContent.addEventListener('scroll', updateScrollbarThumb); 
      }).catch(err=>{ fileContent.textContent = 'Failed to load file: '+err.message; });
    }
  }

  function buildCustomAudioPlayer(label, path){
    fileContent.innerHTML = '';
    const audioPlayer = document.createElement('div');
    audioPlayer.className = 'custom-audio-player';
    const audio = document.createElement('audio');
    audio.src = path; 
    audio.className = 'hidden-audio';
    
    const playbackRow = document.createElement('div'); 
    playbackRow.className = 'audio-playback-row';
    const playbackBar = document.createElement('div'); 
    playbackBar.className = 'audio-playback-bar';
    const progress = document.createElement('div'); 
    progress.className = 'audio-progress';
    const thumb = document.createElement('div'); 
    thumb.className = 'audio-progress-thumb';
    progress.appendChild(thumb); 
    playbackBar.appendChild(progress);
    
    const volumeContainer = document.createElement('div'); 
    volumeContainer.className = 'audio-volume-container';
    const speakerImg = document.createElement('img'); 
    speakerImg.src = 'assets/audio-buttons/speaker.png'; 
    speakerImg.className = 'audio-speaker'; 
    speakerImg.draggable = false;
    const volBar = document.createElement('div'); 
    volBar.className = 'audio-volume-bar';
    const volThumb = document.createElement('div'); 
    volThumb.className = 'audio-volume-thumb'; 
    volBar.appendChild(volThumb);
    volumeContainer.appendChild(speakerImg); 
    volumeContainer.appendChild(volBar); 
    playbackRow.appendChild(playbackBar); 
    playbackRow.appendChild(volumeContainer);
    
    const controlsRow1 = document.createElement('div'); 
    controlsRow1.className = 'audio-controls-row';
    
    function createAudioButton(name, fallbackText){
      const btn = document.createElement('button'); 
      btn.className = 'audio-btn'; 
      btn.dataset.audioControl = name;
      const img = new Image();
      const filenameMap = { play:'play.png', pause:'pause.png', rewind:'5back.png', forward:'5forward.png', stop:'stop.png', voldown:'volumedown.png', volup:'volumeup.png', download:'download.png' };
      const srcName = filenameMap[name] || (name + '.png');
      img.src = 'assets/audio-buttons/'+srcName; 
      img.alt = name; 
      img.style.display = 'none'; 
      img.className = 'audio-btn-img'; 
      img.draggable = false;
      const span = document.createElement('span'); 
      span.className = 'fallback-text'; 
      span.textContent = fallbackText || name;
      img.addEventListener('load', ()=>{ img.style.display = 'block'; span.style.display = 'none'; });
      img.addEventListener('error', ()=>{ img.style.display = 'none'; span.style.display = 'inline-block'; });
      btn.appendChild(img); 
      btn.appendChild(span); 
      btn.draggable = false; 
      return btn;
    }
    
    const playBtn = createAudioButton('play','▶');
    const rewindBtn = createAudioButton('rewind','⏪ -5s');
    const forwardBtn = createAudioButton('forward','⏩ +5s');
    const stopBtn = createAudioButton('stop','⏹ Stop');
    const volDownBtn = createAudioButton('voldown','🔉 -');
    const volUpBtn = createAudioButton('volup','🔊 +');
    
    controlsRow1.appendChild(playBtn); 
    controlsRow1.appendChild(rewindBtn); 
    controlsRow1.appendChild(forwardBtn); 
    controlsRow1.appendChild(stopBtn); 
    controlsRow1.appendChild(volDownBtn); 
    controlsRow1.appendChild(volUpBtn);
    
    const controlsRow2 = document.createElement('div'); 
    controlsRow2.className = 'audio-controls-row';
    const downloadBtn = createAudioButton('download','⬇ Download');
    downloadBtn.dataset.audioControl = 'download';
    
    const speedFiles = ['0-5x','1x','1-5x','2x','4x'];
    const speedValues = [0.5,1,1.5,2,4];
    speedFiles.forEach((fname, idx) => {
      const speedBtn = createAudioButton(fname, String(speedValues[idx])+'x');
      speedBtn.classList.toggle('active', speedValues[idx] === 1);
      speedBtn.dataset.audioControl = 'speed';
      speedBtn.dataset.speedValue = speedValues[idx];
      controlsRow2.appendChild(speedBtn);
    });
    controlsRow2.insertBefore(downloadBtn, controlsRow2.firstChild);
    
    audioPlayer.appendChild(audio); 
    audioPlayer.appendChild(playbackRow); 
    audioPlayer.appendChild(controlsRow1); 
    audioPlayer.appendChild(controlsRow2);
    fileContent.appendChild(audioPlayer);
    
    let isPlaying = false; 
    let currentVolume = 1; 
    let currentSpeed = 1; 
    let audioCtx = null; 
    let gainNode = null; 
    let progressInterval = null;
    
    function setThumbPercent(percent){
      const progRect = progress.getBoundingClientRect();
      const thumbW = thumb.offsetWidth || 16;
      const leftPx = Math.max(0, Math.min(progRect.width, (percent/100) * progRect.width)) - (thumbW/2);
      thumb.style.left = leftPx + 'px';
      thumb.style.transform = 'translateY(-50%)';
    }
    
    function updateProgressOnce(){
      if(!audio.duration || isNaN(audio.duration)) return;
      const percent = (audio.currentTime / audio.duration) * 100;
      setThumbPercent(percent);
    }
    
    function startProgressPolling(){ if(progressInterval) clearInterval(progressInterval); progressInterval = setInterval(updateProgressOnce, 100); }
    function stopProgressPolling(){ if(progressInterval){ clearInterval(progressInterval); progressInterval = null; } }
    
    audio.addEventListener('ended', () => { isPlaying = false; const img = playBtn.querySelector('img'); if(img) img.src = 'assets/audio-buttons/play.png'; stopProgressPolling(); updateProgressOnce(); });
    audio.addEventListener('play', () => { isPlaying = true; const img = playBtn.querySelector('img'); if(img) img.src = 'assets/audio-buttons/pause.png'; startProgressPolling(); });
    audio.addEventListener('pause', () => { isPlaying = false; const img = playBtn.querySelector('img'); if(img) img.src = 'assets/audio-buttons/play.png'; stopProgressPolling(); });
    audio.addEventListener('loadedmetadata', () => { updateProgressOnce(); });
    
    progress.addEventListener('click', (e) => { 
      const rect = progress.getBoundingClientRect(); 
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); 
      audio.currentTime = pct * audio.duration; 
      updateProgressOnce(); 
    });
    
    playBtn.addEventListener('click', async () => {
      if(!audioCtx){ try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ audioCtx = null; } }
      if(audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
      if(audioCtx && !gainNode){ try{ const srcNode = audioCtx.createMediaElementSource(audio); gainNode = audioCtx.createGain(); srcNode.connect(gainNode); gainNode.connect(audioCtx.destination); gainNode.gain.value = currentVolume; }catch(e){ } }
      if(isPlaying){ audio.pause(); isPlaying = false; const img = playBtn.querySelector('img'); if(img) img.src = 'assets/audio-buttons/play.png'; stopProgressPolling(); } 
      else { audio.play(); isPlaying = true; const img = playBtn.querySelector('img'); if(img) img.src = 'assets/audio-buttons/pause.png'; startProgressPolling(); }
    });
    
    rewindBtn.addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 5); updateProgressOnce(); });
    forwardBtn.addEventListener('click', () => { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); updateProgressOnce(); });
    stopBtn.addEventListener('click', () => { audio.pause(); audio.currentTime = 0; isPlaying = false; const img = playBtn.querySelector('img'); if(img) img.src = 'assets/audio-buttons/play.png'; stopProgressPolling(); updateProgressOnce(); });
    
    function applyVolume(){ 
      if(gainNode){ gainNode.gain.value = currentVolume; } 
      else { audio.volume = Math.min(1, currentVolume); } 
      const rect = volBar.getBoundingClientRect(); 
      const pct = (currentVolume / 2) * 100; 
      const thumbW = volThumb.offsetWidth || 12; 
      const leftPx = Math.max(0, Math.min(rect.width, (pct/100)*rect.width)) - (thumbW/2); 
      volThumb.style.left = leftPx + 'px'; 
      volThumb.style.transform = 'translateY(-50%)'; 
    }
    
    volDownBtn.addEventListener('click', () => { currentVolume = Math.max(0, +(currentVolume - 0.2).toFixed(2)); applyVolume(); });
    volUpBtn.addEventListener('click', () => { currentVolume = Math.min(2, +(currentVolume + 0.2).toFixed(2)); applyVolume(); });
    volBar.addEventListener('click', (e) => { const rect = volBar.getBoundingClientRect(); const pct = (e.clientX - rect.left) / rect.width; currentVolume = Math.max(0, Math.min(2, pct * 2)); applyVolume(); });
    downloadBtn.addEventListener('click', () => { const a = document.createElement('a'); a.href = path; a.download = label; a.click(); });
    
    controlsRow2.querySelectorAll('[data-audio-control="speed"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speedValue);
        audio.playbackRate = speed;
        currentSpeed = speed;
        controlsRow2.querySelectorAll('[data-audio-control="speed"]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    
    audio.playbackRate = currentSpeed; 
    applyVolume(); 
    
    function attachHoverBehavior(){
      const allBtns = audioPlayer.querySelectorAll('.audio-btn');
      audioPlayerButtons = Array.from(allBtns);
      audioPlayerButtons.forEach((b, idx)=>{
        b.addEventListener('mouseenter', ()=>{
          audioPlayerFocus = -1;
          audioPlayerButtons.forEach(x=>{ x.classList.remove('kbd-focus'); });
          b.classList.add('hover');
        });
        b.addEventListener('mouseleave', ()=>{ b.classList.remove('hover'); });
      });
    }
    attachHoverBehavior();
    initializeScrollbar(); 
    updateScrollbarThumb();
  }

  let audioPlayerFocus = -1, audioPlayerButtons = [];
  
  function updateAudioButtonFocus(){
    audioPlayerButtons.forEach((btn, idx) => {
      btn.classList.toggle('kbd-focus', idx === audioPlayerFocus);
      btn.classList.remove('hover');
    });
  }

  async function keyHandler(e){
    if(commandModal && commandModal.classList.contains('visible')){
      if(e.key === 'Enter'){
        e.preventDefault();
        processCommand(commandInput.value);
      } else if(e.key === 'Escape'){
        e.preventDefault();
        closeCommandModal();
      }
      return;
    }
    
    if(searchModal && searchModal.classList.contains('visible')){
      if(e.key === 'Enter'){
        e.preventDefault();
        await performSearch(searchInput.value);
        enterSearchResults();
      } else if(e.key === 'Escape'){
        e.preventDefault();
        closeSearchModal();
      }
      return;
    }
    
    if(isSearchMode && mode === 'menu'){
      const n = searchResults.length + 1;
      
      // Period key in search mode
      if(e.key === '.'){
        e.preventDefault();
        if(specialAccessLevel > 0){
          toggleSpecialAccess();
        } else {
          openCommandModal();
        }
        return;
      }
      
      if(e.key==='ArrowDown' || e.key==='s'){ 
        e.preventDefault(); 
        const newSel = clamp(selected+1,0,n-1); 
        if(newSel!==selected){ selected=newSel; playSound('assets/sounds/beep.mp3','beep'); renderSearchResults(); updateHighlight(); } 
      }
      else if(e.key==='ArrowUp' || e.key==='w'){ 
        e.preventDefault(); 
        const newSel = clamp(selected-1,0,n-1); 
        if(newSel!==selected){ selected=newSel; playSound('assets/sounds/beep.mp3','beep'); renderSearchResults(); updateHighlight(); } 
      }
      else if(e.key==='Enter'){ 
        e.preventDefault(); 
        playSound('assets/sounds/blip.mp3','blip'); 
        if(selected === 0){
          exitSearchMode();
        }else if(selected >= 1 && selected <= searchResults.length){
          const file = searchResults[selected - 1];
          const folder = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : '';
          const fullFilename = file.path.includes('/') ? file.path.substring(file.path.lastIndexOf('/') + 1) : file.path;
          const parsed = file.parsed || parseFile(fullFilename);
          const filename = parsed.name;
          const folderParts = folder.split('/').filter(Boolean);
          openFileViewer(filename, folderParts, parsed);
        }
      }
      else if(e.key==='Backspace'){ 
        e.preventDefault(); 
        playSound('assets/sounds/blip.mp3','blip'); 
        exitSearchMode(); 
      }
      return;
    }
    
    if(e.key === '.' && !isSearchMode && mode === 'menu'){
      e.preventDefault();
      if(specialAccessLevel > 0){
        toggleSpecialAccess();
      } else {
        openCommandModal();
      }
      return;
    }
    
    if(mode==='file'){
      // Period key in file viewer mode
      if(e.key === '.'){
        e.preventDefault();
        if(specialAccessLevel > 0){
          toggleSpecialAccess();
        } else {
          openCommandModal();
        }
        return;
      }
      
      const audioPlayer = fileContent.querySelector('.custom-audio-player');
      if(audioPlayer){
        const buttons = audioPlayer.querySelectorAll('.audio-btn');
        audioPlayerButtons = Array.from(buttons);
        const totalButtons = audioPlayerButtons.length;
        
        if(e.key === 'ArrowRight' || e.key === 'd'){
          e.preventDefault();
          audioPlayerFocus = (audioPlayerFocus + 1) % totalButtons;
          updateAudioButtonFocus();
        } else if(e.key === 'ArrowLeft' || e.key === 'a'){
          e.preventDefault();
          audioPlayerFocus = (audioPlayerFocus - 1 + totalButtons) % totalButtons;
          updateAudioButtonFocus();
        } else if(e.key === 'ArrowDown'){
          e.preventDefault();
          const gridColumns = 6;
          if(audioPlayerFocus < 0) audioPlayerFocus = 0;
          if(audioPlayerFocus < gridColumns){
            const candidate = gridColumns + (audioPlayerFocus % gridColumns);
            audioPlayerFocus = candidate < totalButtons ? candidate : totalButtons - 1;
          } else {
            audioPlayerFocus = audioPlayerFocus - gridColumns;
          }
          updateAudioButtonFocus();
        } else if(e.key === 'ArrowUp'){
          e.preventDefault();
          const gridColumns = 6;
          if(audioPlayerFocus < 0) audioPlayerFocus = 0;
          if(audioPlayerFocus >= gridColumns){
            audioPlayerFocus = audioPlayerFocus - gridColumns;
          } else {
            const candidate = gridColumns + (audioPlayerFocus % gridColumns);
            audioPlayerFocus = candidate < totalButtons ? candidate : audioPlayerFocus;
          }
          updateAudioButtonFocus();
        } else if(e.key === 'Enter'){
          e.preventDefault();
          if(audioPlayerFocus >= 0 && audioPlayerFocus < totalButtons){
            audioPlayerButtons[audioPlayerFocus].click();
          }
        } else if(e.key === 'Backspace'){
          e.preventDefault(); 
          playSound('assets/sounds/blip.mp3', 'blip'); 
          closeFileView();
        }
        return;
      }
      
      if(e.key==='Backspace'){ e.preventDefault(); closeFileView(); playSound('assets/sounds/blip.mp3','blip'); }
      else if(e.key==='ArrowDown' || e.key==='s'){ e.preventDefault(); fileContent.scrollBy({top:48}); }
      else if(e.key==='ArrowUp' || e.key==='w'){ e.preventDefault(); fileContent.scrollBy({top:-48}); }
      return;
    }
    
    const manifestResult = await loadFolderManifests(pathParts);
    let n = 0;
    let visibleItems = [];
    
    if(manifestResult.type === 'folders'){
      let visibleCount = pathParts.length > 0 ? 1 : 0;
      manifestResult.data.forEach(f => {
        const parsed = parseFolder(f);
        if(!parsed.isHidden || parsed.hiddenLevel <= specialAccessLevel){
          visibleCount++;
        }
      });
      n = visibleCount;
      if(pathParts.length === 0){
        n += 1;
      }
    }
    else if(manifestResult.type === 'files'){
      visibleItems = manifestResult.data.filter(f => {
        const parsed = parseFile(f);
        return !parsed.isHidden || parsed.hiddenLevel <= specialAccessLevel;
      });
      n = visibleItems.length;
    }
    else if(manifestResult.type === 'legacy' && manifestResult.data.items){
      n = manifestResult.data.items.length;
    }
    
    if(e.key==='ArrowDown' || e.key==='s'){ 
      e.preventDefault(); 
      const newSel = clamp(selected+1,0,Math.max(0,n-1)); 
      if(newSel!==selected){ selected=newSel; playSound('assets/sounds/beep.mp3','beep');  refresh(); } 
    }
    else if(e.key==='ArrowUp' || e.key==='w'){ 
      e.preventDefault(); 
      const newSel = clamp(selected-1,0,Math.max(0,n-1)); 
      if(newSel!==selected){ selected=newSel; playSound('assets/sounds/beep.mp3','beep');  refresh(); } 
    }
    else if(e.key==='Enter'){ 
      e.preventDefault(); 
      playSound('assets/sounds/blip.mp3','blip'); 
      onSelect(visibleItems); 
    }
    else if(e.key==='Backspace'){ 
      e.preventDefault(); 
      if(pathParts.length>0){ 
        playSound('assets/sounds/blip.mp3','blip');
        const currentPathKey = pathParts.join('/');
        navigationHistory[currentPathKey] = selected;
        pathParts.pop();
        const prevPathKey = pathParts.join('/');
        selected = navigationHistory[prevPathKey] !== undefined ? navigationHistory[prevPathKey] : 0;
        applyTheme('green');  
        refresh(); 
      } 
    }
  }

  async function onSelect(visibleFiles){ 
    const manifestResult = await loadFolderManifests(pathParts);
    let visibleFolderCount = 0;
    
    if(manifestResult.type === 'folders'){
      manifestResult.data.forEach(f => {
        const parsed = parseFolder(f);
        if(!parsed.isHidden || parsed.hiddenLevel <= specialAccessLevel){
          visibleFolderCount++;
        }
      });
    }
    
    if(pathParts.length === 0 && manifestResult.type === 'folders' && selected === visibleFolderCount){
      openSearchModal();
      return;
    }
    
    if(manifestResult.type === 'folders'){
      const folders = manifestResult.data;
      const isReturn = (pathParts.length>0 && selected===0);
      if(isReturn){ pathParts.pop(); selected=0; applyTheme('green');  refresh(); return; }
      
      let visibleIdx = pathParts.length > 0 ? selected - 1 : selected;
      let actualIdx = -1;
      let found = 0;
      
      for(let i=0; i<folders.length; i++){
        const parsed = parseFolder(folders[i]);
        if(!parsed.isHidden || parsed.hiddenLevel <= specialAccessLevel){
          if(found === visibleIdx){
            actualIdx = i;
            break;
          }
          found++;
        }
      }
      
      if(actualIdx >= 0 && actualIdx < folders.length){ 
        const entry = folders[actualIdx]; 
        const parsed = parseFolder(entry); 
        
        if(parsed.isHidden && parsed.hiddenLevel > 0){
          applyTheme('purple');
        } else if(parsed.theme) {
          applyTheme(parsed.theme);
        } else {
          applyTheme('green');
        }
        
        const currentPathKey = pathParts.join('/');
        navigationHistory[currentPathKey] = selected;
        
        pathParts.push(parsed.name); 
        selected = navigationHistory[pathParts.join('/')] !== undefined ? navigationHistory[pathParts.join('/')] : 0;
        
        refresh(); 
        return; 
      }
    } else if(manifestResult.type === 'files'){
      const files = manifestResult.data;
      const visible = visibleFiles || files.filter(f => {
        const parsed = parseFile(f);
        return !parsed.isHidden || parsed.hiddenLevel <= specialAccessLevel;
      });
      const idx = selected; 
      if(idx >= 0 && idx < visible.length){ 
        const entry = visible[idx];
        const parsed = parseFile(entry);
        openFileViewer(parsed.name, pathParts.slice(), parsed);
      }
    } else if(manifestResult.type === 'legacy'){
      const legacy = manifestResult.data; 
      const it = legacy.items[selected]; 
      if(it){ 
        if(it.type==='return'){ 
          const tgt = it.target || 'index.html'; 
          if(typeof tgt === 'string' && tgt.endsWith('.json')){ } 
          else { location.href = tgt; } 
        } else if(it.type==='menu' && it.target){ 
          const name = (it.label||'').replace(/\/$/,'').replace(/\s+/g,''); 
          pathParts.push(name); 
          selected=0; 
          refresh(); 
        }
        else if(legacy.filetype){ openFileViewer(it.label, pathParts.slice(), null); }
      }
    }
  }

  async function refresh(){ 
    const container = document.querySelector('.menu-root');
    if(container){
      const oldCount = container.querySelector('.result-count');
      if(oldCount) oldCount.remove();
    }
    
    const res = await loadFolderManifests(pathParts);
    if(res.type === 'folders'){ renderLockedFolder(res.data, pathParts); }
    else if(res.type === 'files'){
      const visibleFiles = res.data.filter(f => {
        const parsed = parseFile(f);
        return !parsed.isHidden || parsed.hiddenLevel <= specialAccessLevel;
      });
      if(selected > visibleFiles.length-1) selected = Math.max(0, visibleFiles.length-1);
      renderScrollFiles(visibleFiles, pathParts, true);
    }
    else if(res.type === 'legacy'){
      const legacy = res.data;
      legacy.items = (legacy.items||[]).filter(it=>!(it.label && String(it.label).toUpperCase()==='EXIT'));
      if(legacy.items.some(it=>it.type==='menu')){
        const folders = legacy.items.filter(it=>it.type==='menu').map(it=> String(it.label).replace(/\/$/,'')); 
        renderLockedFolder(folders, pathParts);
      } else {
        const files = legacy.items.map(it=>it.label).filter(Boolean); 
        renderScrollFiles(files, pathParts, true);
      }
    } else { menuRoot.innerHTML = '<li class="menu-item">No data</li>'; }
    updateHighlight();
    document.body.classList.add('ready');
  }

  let scrollbarThumb = null; 
  let isDraggingThumb = false;
  
  function initializeScrollbar(){ 
    const scrollbarContainer = document.querySelector('.file-scrollbar'); 
    if(!scrollbarThumb && scrollbarContainer){ 
      scrollbarThumb = document.createElement('div'); 
      scrollbarThumb.className='file-scrollbar-thumb'; 
      scrollbarContainer.appendChild(scrollbarThumb); 
      updateScrollbarThumb(); 
      scrollbarThumb.addEventListener('mousedown', (e)=>{ isDraggingThumb=true; e.preventDefault(); }); 
      window.addEventListener('mousemove', (e)=>{ 
        if(isDraggingThumb && scrollbarThumb && fileContent){ 
          const scrollbarRect = scrollbarThumb.parentElement.getBoundingClientRect(); 
          const thumbHeight = scrollbarThumb.offsetHeight; 
          const maxY = scrollbarRect.height - thumbHeight; 
          const y = e.clientY - scrollbarRect.top; 
          const ratio = Math.max(0, Math.min(1, y / maxY)); 
          fileContent.scrollTop = ratio * (fileContent.scrollHeight - fileContent.clientHeight); 
        } 
      }); 
      window.addEventListener('mouseup', ()=>{ isDraggingThumb=false; }); 
    } 
  }
  
  function updateScrollbarThumb(){ 
    if(!scrollbarThumb || !fileContent) return; 
    const container = scrollbarThumb.parentElement; 
    const scrollHeight = fileContent.scrollHeight; 
    const clientHeight = fileContent.clientHeight; 
    const containerHeight = container.clientHeight; 
    const gap = 2; 
    if(scrollHeight <= clientHeight){ 
      scrollbarThumb.style.height = (containerHeight - gap) + 'px'; 
      scrollbarThumb.style.top = '0px'; 
    } else { 
      const thumbHeight = Math.max(20, (clientHeight / scrollHeight) * containerHeight); 
      const thumbTop = (fileContent.scrollTop / scrollHeight) * containerHeight; 
      scrollbarThumb.style.height = thumbHeight + 'px'; 
      scrollbarThumb.style.top = thumbTop + 'px'; 
    } 
  }

  function closeFileView(){ 
    mode='menu'; 
    fileView.classList.remove('visible'); 
    fileHeader.textContent=''; 
    fileContent.textContent=''; 
    if(scrollbarThumb) scrollbarThumb.remove(); 
    scrollbarThumb=null; 
    audioPlayerFocus=-1; 
    audioPlayerButtons=[]; 
    fileContent.removeEventListener('scroll', updateScrollbarThumb); 
  }

  function renderMarkdown(md){ 
    let html = md.replace(/&/g,'&amp;').replace(/</g,'<').replace(/>/g,'>'); 
    html = html.replace(/\`\`\`([\s\S]*?)\`\`\`/g, '<pre><code>$1</code></pre>'); 
    html = html.replace(/^### (.*$)/gim,'<h3>$1</h3>'); 
    html = html.replace(/^## (.*$)/gim,'<h2>$1</h2>'); 
    html = html.replace(/^# (.*$)/gim,'<h1>$1</h1>'); 
    html = html.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>'); 
    html = html.replace(/\*(.*?)\*/g,'<em>$1</em>'); 
    html = html.replace(/^(?:- |\* )(.*)/gim,'<li>$1</li>'); 
    html = html.replace(/(<li>.*<\/li>)/gms,'<ul>$1</ul>'); 
    html = html.replace(/(^|\n)\s*([^<\n][^\n]+)/g, (m,p1,p2)=>{ if(/^<\/?(h|ul|li|pre|code|strong|em)/.test(p2)) return '\n'+p2; return '<p>'+p2+'</p>'; }); 
    return html; 
  }

  selected = 0; 
  applyTheme('green'); 
  refresh(); 
  window.addEventListener('keydown', keyHandler);
  refresh();
  buildSearchIndex();

})();

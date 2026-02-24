// db-page.js — menu renderer & keyboard navigation
(function(){
  const params = new URLSearchParams(location.search);
  const menuFile = params.get('menu') || 'db/db.json';
  const menuRoot = document.getElementById('menuList');
  let menuData = null;
  let selected = 0;
  let mode = 'menu'; // 'menu' or 'file'
  const fileView = document.getElementById('fileView');
  const fileHeader = document.getElementById('fileHeader');
  const fileContent = document.getElementById('fileContent');
  const soundSettings = {
    beep: { currentTime: 0, volume: 0.4, playbackRate: 2 },
    blip: { currentTime: 0, volume: 0.7, playbackRate: 1.3 }
  };

  function playSound(src, soundType = 'beep'){
    try{
      const a = new Audio(src);
      const settings = soundSettings[soundType] || soundSettings.beep;
      a.currentTime = settings.currentTime;
      a.volume = settings.volume;
      a.playbackRate = settings.playbackRate;
      a.play();
    }catch(e){console.warn('Audio failed',e)}
  }

  function fetchMenu(path){
    return fetch(path).then(r=>{ if(!r.ok) throw new Error('Failed to load '+path); return r.json(); });
  }

  function clearMenu(){ menuRoot.innerHTML=''; }

  function renderLocked(items){
    clearMenu();
    items.forEach((it, idx)=>{
      const li = document.createElement('li'); li.className='menu-item'; li.dataset.index=idx;
      const span = document.createElement('span'); span.className='label'; span.textContent = it.label || '';
      li.appendChild(span);
      menuRoot.appendChild(li);
    });
    // locked variant: ensure body class
    document.body.classList.add('locked');
    document.body.classList.remove('scrolling');
    updateHighlight();
  }

  function visibleRangeForScroll(n, sel){
    const maxOffset = 4; // show up to 4 away each side (center + 8 faded neighbors -> 9 visible)
    if(n <= (maxOffset*2+1)) return [0, n-1];
    let start = sel - maxOffset;
    let end = sel + maxOffset;
    if(start < 0) start = 0;
    if(end > n-1) end = n-1;
    return [start, end];
  }

  function renderScroll(items){
    clearMenu();
    // ensure body class for scroll layout
    document.body.classList.remove('locked');
    document.body.classList.add('scrolling');
    // always render 9 slots (selected centered at slot index 4)
    const slots = 9;
    const centerOffset = Math.floor(slots/2); // 4
    for(let s=0;s<slots;s++){
      const idx = selected + (s - centerOffset);
      const li = document.createElement('li'); li.className='menu-item'; li.dataset.index=idx;
      const dist = Math.abs(idx - selected);
      if(idx < 0 || idx >= items.length){
        li.classList.add('empty');
        li.appendChild(document.createElement('span'));
        // still apply dim based on distance so ghosts size correctly
        if(dist>=1 && dist<=4) li.classList.add('dim-'+dist);
      } else {
        const it = items[idx];
        const span = document.createElement('span'); span.className='label'; span.textContent = it.label || '';
        li.appendChild(span);
        if(dist===0) li.classList.add('highlight');
        else if(dist<=4) li.classList.add('dim-'+dist);
      }
      menuRoot.appendChild(li);
    }
    // menu-list is centered in its container so the center slot stays at fixed position
  }

  function updateHighlight(){
    const items = menuRoot.querySelectorAll('.menu-item');
    items.forEach(el=>{
      const idx = Number(el.dataset.index);
      el.classList.remove('highlight','dim-1','dim-2','dim-3','dim-4');
      if(idx === selected){ el.classList.add('highlight'); }
      else {
        const dist = Math.abs(idx - selected);
        if(dist>=1 && dist<=4) el.classList.add('dim-'+dist);
        else el.style.opacity = '';
      }
    });
  }

  function refresh(){
    if(!menuData) return;
    
    // If autoload is enabled, fetch files from manifest first
    if(menuData.autoload && menuData.folder){
      const manifestPath = `db/${menuData.folder}/files.json`;
      
      fetch(manifestPath).then(r => {
        if(!r.ok) throw new Error('Failed to load manifest');
        return r.json();
      }).then(files => {
        // Add loaded files to items (preserving the return button at index 0)
        const baseItems = menuData.items.slice(0, 1); // Get return button
        const fileItems = files.map(f => ({ label: f }));
        menuData.items = baseItems.concat(fileItems);
        
        // Now render
        selected = Math.min(selected, menuData.items.length - 1);
        if(menuData.variant === 'locked'){
          renderLocked(menuData.items);
        } else {
          renderScroll(menuData.items);
        }
        updateHighlight();
      }).catch(err => {
        console.warn('Autoload failed:', err);
        // Fallback to provided items
        if(menuData.variant === 'locked'){
          renderLocked(menuData.items);
        } else {
          renderScroll(menuData.items);
        }
        updateHighlight();
      });
      return;
    }
    
    if(menuData.variant === 'locked'){
      renderLocked(menuData.items);
    } else {
      renderScroll(menuData.items);
    }
    // ensure selected item visible for focus purposes
    updateHighlight();
  }

  function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

  let audioPlayerFocus = -1; // -1 means no focus, 0+ means button index
  let audioPlayerButtons = [];

  function updateAudioButtonFocus(){
    audioPlayerButtons.forEach((btn, idx) => {
      btn.classList.toggle('kbd-focus', idx === audioPlayerFocus);
      btn.classList.remove('hover');
    });
  }

  function keyHandler(e){
    const n = menuData.items.length;
    if(mode === 'file'){
      const audioPlayer = fileContent.querySelector('.custom-audio-player');
      
      // If audio player exists, handle button navigation
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
          // column-aware vertical movement. gridColumns matches layout (6 columns)
          const gridColumns = 6;
          if(audioPlayerFocus < 0) audioPlayerFocus = 0;
          if(audioPlayerFocus < gridColumns){
            // move to corresponding column in row 2
            const candidate = gridColumns + (audioPlayerFocus % gridColumns);
            audioPlayerFocus = candidate < totalButtons ? candidate : totalButtons - 1;
          } else {
            // move up to the row above
            audioPlayerFocus = audioPlayerFocus - gridColumns;
          }
          updateAudioButtonFocus();
        } else if(e.key === 'ArrowUp'){
          e.preventDefault();
          const gridColumns = 6;
          if(audioPlayerFocus < 0) audioPlayerFocus = 0;
          if(audioPlayerFocus >= gridColumns){
            // move to the row above
            audioPlayerFocus = audioPlayerFocus - gridColumns;
          } else {
            // move down if nothing above
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
          e.preventDefault(); playSound('assets/sounds/blip.mp3', 'blip'); closeFileView();
        }
        return;
      }
      
      // scrolling inside file (no beep sounds for file scrolling)
      if(e.key==='ArrowDown' || e.key==='s'){ e.preventDefault(); fileContent.scrollBy({top:48,behavior:'auto'}); }
      else if(e.key==='ArrowUp' || e.key==='w'){ e.preventDefault(); fileContent.scrollBy({top:-48,behavior:'auto'}); }
      else if(e.key==='Backspace'){
        e.preventDefault(); playSound('assets/sounds/blip.mp3', 'blip'); closeFileView();
      }
      return;
    }
    // mode === 'menu'
    if(e.key==='ArrowDown' || e.key==='s'){
      e.preventDefault(); const newSel = clamp(selected+1,0,n-1); if(newSel !== selected){ selected = newSel; playSound('assets/sounds/beep.mp3', 'beep'); refresh(); } }
    else if(e.key==='ArrowUp' || e.key==='w'){
      e.preventDefault(); const newSel = clamp(selected-1,0,n-1); if(newSel !== selected){ selected = newSel; playSound('assets/sounds/beep.mp3', 'beep'); refresh(); } }
    else if(e.key==='Enter'){
      e.preventDefault(); playSound('assets/sounds/blip.mp3', 'blip'); const item = menuData.items[selected];
      if(!item) return;
      // return entries
      if(item.type==='return'){
        const tgt = item.target || menuData.return || 'index.html';
        if(typeof tgt === 'string' && tgt.endsWith('.json')){
          fetchMenu(tgt).then(d=>{ menuData = d; selected = 0; refresh(); }).catch(err=>console.error(err));
        } else {
          location.href = tgt;
        }
        return;
      }

      // open a menu target
      if(item.target && typeof item.target === 'string' && item.target.endsWith('.json')){
        fetchMenu(item.target).then(d=>{ menuData = d; selected = 0; refresh(); }).catch(err=>console.error(err));
        return;
      }

      // if current menu is a scroll variant and has filetype, Enter opens a file viewer
      if(menuData.variant === 'scroll' && menuData.filetype){
        const idx = selected;
        if(idx >=0 && idx < menuData.items.length){
          const it = menuData.items[idx];
          if(it && !(it.type === 'return' || it.type === 'menu')){
            openFileViewer(it.label, menuData.filetype);
          }
        }
      }
    }
    else if(e.key==='Backspace'){
      e.preventDefault(); playSound('assets/sounds/blip.mp3', 'blip'); const returnTarget = menuData.return || 'index.html';
      if(typeof returnTarget === 'string' && returnTarget.endsWith('.json')){
        fetchMenu(returnTarget).then(d=>{ menuData = d; selected = 0; refresh(); }).catch(err=>{ console.error(err); location.href = 'index.html'; });
      } else {
        location.href = returnTarget;
      }
    }
  }

  // initialize
  fetchMenu(menuFile).then(data=>{
    menuData = data;
    // if the json describes a 'menu' to load other jsons via clicks, we could handle that later
    // default selected stays at 0 (the return button)
    selected = 0;
    refresh();
    window.addEventListener('keydown', keyHandler);
  }).catch(err=>{
    console.error('Menu load failed',err);
    menuRoot.innerHTML = '<li class="menu-item">Failed to load menu</li>';
  });

  // file viewer helpers
  let scrollbarThumb = null;
  let isDraggingThumb = false;

  function initializeScrollbar(){
    const scrollbarContainer = document.querySelector('.file-scrollbar');
    if(!scrollbarThumb && scrollbarContainer){
      scrollbarThumb = document.createElement('div');
      scrollbarThumb.className = 'file-scrollbar-thumb';
      scrollbarContainer.appendChild(scrollbarThumb);
      updateScrollbarThumb();
      
      // Drag handling
      scrollbarThumb.addEventListener('mousedown', (e)=>{
        isDraggingThumb = true;
        e.preventDefault();
      });
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
      window.addEventListener('mouseup', ()=>{ isDraggingThumb = false; });
    }
  }

  function updateScrollbarThumb(){
    if(!scrollbarThumb || !fileContent) return;
    const container = scrollbarThumb.parentElement;
    const scrollHeight = fileContent.scrollHeight;
    const clientHeight = fileContent.clientHeight;
    const containerHeight = container.clientHeight;
    const gap = 2; // tiny gap
    if(scrollHeight <= clientHeight){
      // Not scrollable - fill the container with a tiny gap at bottom
      scrollbarThumb.style.height = (containerHeight - gap) + 'px';
      scrollbarThumb.style.top = '0px';
    } else {
      const thumbHeight = Math.max(20, (clientHeight / scrollHeight) * containerHeight);
      const thumbTop = (fileContent.scrollTop / scrollHeight) * containerHeight;
      scrollbarThumb.style.height = thumbHeight + 'px';
      scrollbarThumb.style.top = thumbTop + 'px';
    }
  }

  function openFileViewer(label, filetype){
    mode = 'file';
    fileView.classList.add('visible');
    fileHeader.textContent = label;
    
    // Use the folder from menuData if available, otherwise map filetype to folder
    const folder = menuData.folder || 
                   (filetype === 'image' ? 'png' : 
                    filetype === 'audio' ? 'mp3' : 
                    filetype);
    
    const path = `db/${folder}/${label}`;
    
    // Handle different file types
    if(filetype === 'image'){
      fileContent.innerHTML = '';
      const img = document.createElement('img');
      img.src = path;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.objectFit = 'contain';
      fileContent.appendChild(img);
      initializeScrollbar();
      updateScrollbarThumb();
    } else if(filetype === 'audio'){
      fileContent.innerHTML = '';
      const audioPlayer = document.createElement('div');
      audioPlayer.className = 'custom-audio-player';
      
      // Hidden audio element for playback
      const audio = document.createElement('audio');
      audio.src = path;
      audio.className = 'hidden-audio';
      
      // Playback bar (layer 1) and volume area
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
      
      // Controls layer 1 (row 1)
      const controlsRow1 = document.createElement('div');
      controlsRow1.className = 'audio-controls-row';
      
      // Helper to create an audio button that prefers an image from assets/audio-buttons/<filename>
      function createAudioButton(name, fallbackText){
        const btn = document.createElement('button');
        btn.className = 'audio-btn';
        btn.dataset.audioControl = name;

        const img = new Image();
        // map logical names to exact filenames in assets/audio-buttons
        const filenameMap = {
          'play': 'play.png',
          'pause': 'pause.png',
          'rewind': '5back.png',
          'forward': '5forward.png',
          'stop': 'stop.png',
          'voldown': 'volumedown.png',
          'volup': 'volumeup.png',
          'download': 'download.png'
        };
        const srcName = filenameMap[name] || (name + '.png');
        img.src = `assets/audio-buttons/${srcName}`;
        img.alt = name;
        img.style.display = 'none';
        img.className = 'audio-btn-img';
        img.draggable = false;

        const span = document.createElement('span');
        span.className = 'fallback-text';
        span.textContent = fallbackText || name;

        // swap visibility based on load
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

      // Ensure play button uses the correct initial image
      const _pimg = playBtn.querySelector('img');
      if(_pimg) _pimg.src = 'assets/audio-buttons/play.png';
      
      // Controls layer 2 (row 2)
      const controlsRow2 = document.createElement('div');
      controlsRow2.className = 'audio-controls-row';
      
      const downloadBtn = createAudioButton('download','⬇ Download');
      downloadBtn.dataset.audioControl = 'download';
      
      // exact filenames for speed buttons in assets/audio-buttons
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
      
      // Audio player state
      let isPlaying = false;
      let currentVolume = 1; // default 100% (maps to gain 1)
      let currentSpeed = 1;
      let audioCtx = null;
      let gainNode = null;
      let progressInterval = null;

      function setThumbPercent(percent){
        // percent is 0..100. Position thumb by setting left in pixels so it's accurate
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

      function startProgressPolling(){
        if(progressInterval) clearInterval(progressInterval);
        progressInterval = setInterval(updateProgressOnce, 100);
      }

      function stopProgressPolling(){
        if(progressInterval){ clearInterval(progressInterval); progressInterval = null; }
      }

      audio.addEventListener('ended', () => {
        isPlaying = false;
        // update play button image
        const img = playBtn.querySelector('img');
        if(img) img.src = 'assets/audio-buttons/play.png';
        stopProgressPolling();
        updateProgressOnce();
      });

      // keep play/pause UI in sync if playback state changes externally
      audio.addEventListener('play', () => {
        isPlaying = true;
        const img = playBtn.querySelector('img');
        if(img) img.src = 'assets/audio-buttons/pause.png';
        startProgressPolling();
      });
      audio.addEventListener('pause', () => {
        isPlaying = false;
        const img = playBtn.querySelector('img');
        if(img) img.src = 'assets/audio-buttons/play.png';
        stopProgressPolling();
      });

      // ensure initial progress position once metadata is loaded
      audio.addEventListener('loadedmetadata', () => {
        updateProgressOnce();
      });
      
      // Handle progress bar click
      progress.addEventListener('click', (e) => {
        const rect = progress.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audio.currentTime = pct * audio.duration;
        updateProgressOnce();
      });
      
      // Button handlers
      playBtn.addEventListener('click', async () => {
        if(!audioCtx){
          try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ audioCtx = null; }
        }
        if(audioCtx && audioCtx.state === 'suspended') await audioCtx.resume();
        if(audioCtx && !gainNode){
          try{
            const srcNode = audioCtx.createMediaElementSource(audio);
            gainNode = audioCtx.createGain();
            srcNode.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            gainNode.gain.value = currentVolume;
          }catch(e){ console.warn('WebAudio setup failed', e); }
        }

        if(isPlaying){
          audio.pause();
          isPlaying = false;
          const img = playBtn.querySelector('img');
          if(img) img.src = 'assets/audio-buttons/play.png';
          stopProgressPolling();
        } else {
          audio.play();
          isPlaying = true;
          const img = playBtn.querySelector('img');
          if(img) img.src = 'assets/audio-buttons/pause.png';
          startProgressPolling();
        }
      });
      
      rewindBtn.addEventListener('click', () => {
        audio.currentTime = Math.max(0, audio.currentTime - 5);
        updateProgressOnce();
      });
      
      forwardBtn.addEventListener('click', () => {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + 5);
        updateProgressOnce();
      });
      
      stopBtn.addEventListener('click', () => {
        audio.pause();
        audio.currentTime = 0;
        isPlaying = false;
        const img = playBtn.querySelector('img'); if(img) img.src = 'assets/audio-buttons/play.png';
        stopProgressPolling();
        updateProgressOnce();
      });
      
      // Volume semantics: default 100% (1), max 200% (2). Steps of 20% (0.2)
      function applyVolume(){
        if(gainNode){ gainNode.gain.value = currentVolume; }
        else { audio.volume = Math.min(1, Math.min(1, currentVolume)); }
        // update volume thumb UI (left position using bar width)
        const rect = volBar.getBoundingClientRect();
        const pct = (currentVolume / 2) * 100; // 0..100
        const thumbW = volThumb.offsetWidth || 12;
        const leftPx = Math.max(0, Math.min(rect.width, (pct/100)*rect.width)) - (thumbW/2);
        volThumb.style.left = leftPx + 'px';
        volThumb.style.transform = 'translateY(-50%)';
      }

      volDownBtn.addEventListener('click', () => {
        currentVolume = Math.max(0, +(currentVolume - 0.2).toFixed(2));
        applyVolume();
      });

      volUpBtn.addEventListener('click', () => {
        currentVolume = Math.min(2, +(currentVolume + 0.2).toFixed(2));
        applyVolume();
      });

      // Click on volume bar to set volume
      volBar.addEventListener('click', (e) => {
        const rect = volBar.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        currentVolume = Math.max(0, Math.min(2, pct * 2));
        applyVolume();
      });
      
      downloadBtn.addEventListener('click', () => {
        const a = document.createElement('a');
        a.href = path;
        a.download = label;
        a.click();
      });
      
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

      // hover vs keyboard focus: make mouse interactions clear focus state
      function attachHoverBehavior(){
        const allBtns = audioPlayer.querySelectorAll('.audio-btn');
        audioPlayerButtons = Array.from(allBtns);
        audioPlayerButtons.forEach((b, idx)=>{
          b.addEventListener('mouseenter', ()=>{
            // mouse hover takes precedence
            audioPlayerFocus = -1;
            audioPlayerButtons.forEach(x=>{ x.classList.remove('kbd-focus'); });
            b.classList.add('hover');
          });
          b.addEventListener('mouseleave', ()=>{ b.classList.remove('hover'); });
          b.addEventListener('click', ()=>{ /* clicks handled by existing handlers */ });
        });
      }

      attachHoverBehavior();

      // ensure volume thumb initial position
      applyVolume();
      
      initializeScrollbar();
      updateScrollbarThumb();
    } else {
      // txt or md (text files)
      fetch(path).then(r=>{
        if(!r.ok) throw new Error('Failed to load file');
        return r.text();
      }).then(text=>{
        // render based on filetype
        if(filetype === 'md'){
          fileContent.innerHTML = renderMarkdown(text);
        } else {
          fileContent.textContent = text;
        }
        fileContent.scrollTop = 0;
        initializeScrollbar();
        updateScrollbarThumb();
        fileContent.addEventListener('scroll', updateScrollbarThumb);
      }).catch(err=>{
        fileContent.textContent = 'Failed to load file: '+err.message;
      });
    }
  }

  // very small markdown renderer for common constructs
  function renderMarkdown(md){
    // escape
    let html = md.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // code blocks ```
    html = html.replace(/```([\s\S]*?)```/g, (m,p)=>`<pre><code>${p}</code></pre>`);
    // headings
    html = html.replace(/^### (.*$)/gim,'<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim,'<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim,'<h1>$1</h1>');
    // bold/italic
    html = html.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
    html = html.replace(/\*(.*?)\*/g,'<em>$1</em>');
    // unordered lists
    html = html.replace(/^(?:- |\* )(.*)/gim,'<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>)/gms,'<ul>$1</ul>');
    // paragraphs
    html = html.replace(/(^|\n)\s*([^<\n][^\n]+)/g, (m,p1,p2)=>{ if(/^<\/?(h|ul|li|pre|code|strong|em)/.test(p2)) return '\n'+p2; return `<p>${p2}</p>` });
    return html;
  }

  function closeFileView(){
    mode = 'menu';
    fileView.classList.remove('visible');
    fileHeader.textContent = '';
    fileContent.textContent = '';
    if(scrollbarThumb) scrollbarThumb.remove();
    scrollbarThumb = null;
    audioPlayerFocus = -1;
    audioPlayerButtons = [];
    fileContent.removeEventListener('scroll', updateScrollbarThumb);
  }

})();

// ========= Audio sources =========
        let audios = [
            { name: "xxn1ff - anything 4 a fix", url: "https://odiumvrc.com/xxn1ff - anything 4 a fix (prod. 9lives).mp3" },
            { name: "keshi - Id", url: "https://odiumvrc.com/bg.ogg" }
        ];

        // ========= Globals =========
        let containerRef = null; // tsParticles container
        let audioEl = null, audioCtx = null, analyser = null, sourceNode = null;
        let dataArray = null, beatCutoff = 0, beatHoldFrames = 20, beatDecayRate = 0.97, beatFrames = 0;
        let currentIndex = 0; let playing = false;

        // ========= Particles =========
        const palette = ["#e91f42", "#ff6b8a", "#141c2c", "#c2185b", "#ff4081"]; // accent options
        tsParticles.load("tsparticles", {
        particles: { number: { value: 30, density: { enable: true, area: 800 } }, color: { value: palette }, shape: { type: "polygon", polygon: { sides: 6 } }, opacity: { value: 0.3, random: true, animation: { enable: true, speed: 0.5, minimumValue: 0.1, sync: false } }, size: { value: 30, random: { enable: true, minimumValue: 10 }, animation: { enable: true, speed: 2, minimumValue: 10, sync: false } }, links: { enable: true, distance: 150, color: "#e91f42", opacity: 0.2, width: 1 }, move: { enable: true, speed: 1, direction: "none", random: true, straight: false, outModes: { default: "bounce" }, attract: { enable: true, rotateX: 600, rotateY: 1200 } }, rotate: { value: 0, random: true, direction: "clockwise", animation: { enable: true, speed: 5, sync: false } } },
        interactivity: { detectsOn: "canvas", events: { onHover: { enable: true, mode: "grab" }, onClick: { enable: true, mode: "push" }, resize: true }, modes: { grab: { distance: 200, links: { opacity: 0.5 } }, push: { quantity: 2 } } },
        background: { color: "transparent" }, detectRetina: true
        }).then(c => { containerRef = c; });

        // ========= Slideshow =========
        let currentSlideIndex = 0;
        const slides = () => Array.from(document.querySelectorAll('.slide'));
        const indicators = () => Array.from(document.querySelectorAll('.indicator'));
        function showSlide(index) { slides().forEach(s => s.classList.remove('active')); indicators().forEach(i => i.classList.remove('active')); slides()[index].classList.add('active'); indicators()[index].classList.add('active'); }
        function changeSlide(dir) { currentSlideIndex += dir; const s = slides(); if (currentSlideIndex >= s.length) currentSlideIndex = 0; if (currentSlideIndex < 0) currentSlideIndex = s.length - 1; showSlide(currentSlideIndex); }
        function currentSlide(i) { currentSlideIndex = i - 1; showSlide(currentSlideIndex); }
        setInterval(() => changeSlide(1), 5000);

        // ========= Lightbox Preview =========
        const pv = document.getElementById('preview');
        const pvImg = document.getElementById('pvImg');
        const pvCap = document.getElementById('pvCap');
        const pvClose = document.getElementById('pvClose');
        const pvPrev = document.getElementById('pvPrev');
        const pvNext = document.getElementById('pvNext');

        function bgUrlToSrc(el){
        const bg = getComputedStyle(el).backgroundImage; // url("...")
        const match = bg && bg.match(/url\(["']?(.*?)["']?\)/);
        return match ? match[1] : '';
        }
        let lbIndex = 0;
        function openPreview(idx){
        lbIndex = idx;
        const sEls = Array.from(document.querySelectorAll('.slide-image'));
        const src = bgUrlToSrc(sEls[idx]);
        const title = sEls[idx].closest('.slide-content').querySelector('.slide-title')?.textContent || '';
        pvImg.src = src; pvCap.textContent = title; pv.classList.add('open');
        }
        function closePreview(){ pv.classList.remove('open'); }
        function navPreview(dir){
        const imgs = Array.from(document.querySelectorAll('.slide-image'));
        lbIndex = (lbIndex + dir + imgs.length) % imgs.length;
        pvImg.src = bgUrlToSrc(imgs[lbIndex]);
        pvCap.textContent = imgs[lbIndex].closest('.slide-content').querySelector('.slide-title')?.textContent || '';
        }

        pvClose.addEventListener('click', closePreview);
        pv.addEventListener('click', (e)=>{ if (e.target === pv) closePreview(); });
        pvPrev.addEventListener('click', ()=> navPreview(-1));
        pvNext.addEventListener('click', ()=> navPreview(1));
        window.addEventListener('keydown', (e)=>{
        if (!pv.classList.contains('open')) return;
        if (e.key === 'Escape') closePreview();
        if (e.key === 'ArrowLeft') navPreview(-1);
        if (e.key === 'ArrowRight') navPreview(1);
        });

        // make slide images clickable
        Array.from(document.querySelectorAll('.slide-image')).forEach((el, idx)=>{
        el.addEventListener('click', ()=> openPreview(idx));
        });

        // ========= Typewriter =========
        function startTypewriterAnimation() {
        const lines = ["line1","line2","line3"].map(id => document.getElementById(id)).filter(Boolean);
        let i = 0; (function typeNext(){ if (i < lines.length) { const el = lines[i]; el.classList.add('typing'); setTimeout(()=>{ el.classList.add('finished'); i++; setTimeout(typeNext, 800); }, 3000); } })();
        }

        // ========= Discord button & Modal =========
        const modal = document.getElementById('modal');
        const modalClose = document.getElementById('modalClose');
        
        document.getElementById('discordBtn').addEventListener('click', ()=>{ 
            window.location.href = "/login"
        });
        
        modalClose.addEventListener('click', ()=>{ 
            modal.classList.remove('open'); 
        });
        
        modal.addEventListener('click', (e)=>{ 
            if (e.target === modal) modal.classList.remove('open'); 
        });

        // ========= Custom Cursor follow + Trail =========
        (function setupCursor(){ 
        const dot = document.getElementById('cDot'); 
        const ring = document.getElementById('cRing'); 
        let x = innerWidth/2, y = innerHeight/2, rx = x, ry = y; 
        let lastTrailTime = 0;
        const trailInterval = 30; // milliseconds between particles
        
        window.addEventListener('mousemove', e => { 
            x = e.clientX; 
            y = e.clientY; 
            dot.style.left = x+"px"; 
            dot.style.top = y+"px"; 
            
            // Create trail particles
            const now = Date.now();
            if (now - lastTrailTime > trailInterval) {
            createTrailParticle(x, y);
            lastTrailTime = now;
            }
        }); 
        
        function createTrailParticle(px, py) {
            // Randomly choose between snow particle or paw
            const isPaw = Math.random() < 0.15; // 15% chance for paw
            const particle = document.createElement('div');
            particle.className = 'trail-particle ' + (isPaw ? 'trail-paw' : 'trail-snow');
            
            // Add some randomness to position
            const offsetX = (Math.random() - 0.5) * 20;
            const offsetY = (Math.random() - 0.5) * 20;
            
            particle.style.left = (px + offsetX) + 'px';
            particle.style.top = (py + offsetY) + 'px';
            
            document.body.appendChild(particle);
            
            // Remove after animation
            setTimeout(() => particle.remove(), 1200);
        }
        
        function raf(){ 
            rx += (x - rx) * 0.18; 
            ry += (y - ry) * 0.18; 
            ring.style.left = rx+"px"; 
            ring.style.top = ry+"px"; 
            requestAnimationFrame(raf); 
        } 
        raf(); 
        })();

        // ========= Audio + Visualizer =========
        const audioUI = document.getElementById('audioUI');
        const nowTrack = document.getElementById('nowTrack');
        const playPauseBtn = document.getElementById('playPauseBtn');
        const nextBtn = document.getElementById('nextBtn');
        const prevBtn = document.getElementById('prevBtn');
        const playlistDiv = document.getElementById('plistItems');
        const playlistWrap = document.getElementById('playlist');

        function initAudio(){
        audioEl = new Audio(); audioEl.crossOrigin = 'anonymous'; audioEl.preload = 'auto'; setTrack(0);
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        sourceNode = audioCtx.createMediaElementSource(audioEl);
        analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; const bufferLength = analyser.frequencyBinCount; dataArray = new Uint8Array(bufferLength);
        sourceNode.connect(analyser); analyser.connect(audioCtx.destination);
        playlistDiv.innerHTML = '';
        audios.forEach((a, idx) => { const div = document.createElement('div'); div.className = 'playlist-item' + (idx === currentIndex ? ' active' : ''); div.textContent = a.name; div.addEventListener('click', () => { setTrack(idx); play(); }); playlistDiv.appendChild(div); });
        audioUI.style.display = 'flex'; playlistWrap.style.display = 'block';
        requestAnimationFrame(vizLoop);
        }

        function setTrack(i){ currentIndex = (i + audios.length) % audios.length; audioEl.src = audios[currentIndex].url; audioEl.volume = 0.1; nowTrack.textContent = audios[currentIndex].name; document.querySelectorAll('.playlist-item').forEach((el, idx)=>{ el.classList.toggle('active', idx === currentIndex); }); }
        function play(){ audioEl.play(); playing = true; playPauseBtn.textContent = '⏸'; }
        function pause(){ audioEl.pause(); playing = false; playPauseBtn.textContent = '▶'; }
        playPauseBtn.addEventListener('click', ()=>{ playing ? pause() : play(); });
        nextBtn.addEventListener('click', ()=>{ setTrack(currentIndex+1); play(); });
        prevBtn.addEventListener('click', ()=>{ setTrack(currentIndex-1); play(); });
        audioEl?.addEventListener?.('ended', ()=>{ setTrack(currentIndex+1); play(); });

        function vizLoop(){ if (!analyser || !containerRef) { requestAnimationFrame(vizLoop); return; } analyser.getByteFrequencyData(dataArray); const bassEnd = Math.max(8, Math.floor(dataArray.length * 0.12)); let sum = 0; for (let i=0; i<bassEnd; i++) sum += dataArray[i]; const avg = sum / bassEnd / 255; if (avg > beatCutoff && avg > 0.25) { onBeat(avg); beatCutoff = avg * 1.08; beatFrames = 0; } else { if (beatFrames <= beatHoldFrames) beatFrames++; else beatCutoff *= beatDecayRate; beatCutoff = Math.max(0.2, beatCutoff); } requestAnimationFrame(vizLoop); }
        function onBeat(strength){ if (!containerRef) return; const parts = containerRef.particles.array; for (let i = 0; i < parts.length; i++) { const p = parts[i]; const col = palette[Math.floor(Math.random()*palette.length)]; p.getFillColor = () => ({ value: col }); p.size.value = Math.min(60, p.size.value + 8 * (1 + strength)); p.opacity.value = Math.min(0.9, p.opacity.value + 0.15); } setTimeout(()=>{ if (!containerRef) return; containerRef.particles.array.forEach(p=>{ p.size.value = Math.max(10, p.size.value - 6); p.opacity.value = Math.max(0.2, p.opacity.value - 0.12); }); }, 120); }

        // ========= Gate =========
        document.getElementById('gateBtn').addEventListener('click', async ()=>{
        const gate = document.getElementById('gate');
        if (!audioCtx) initAudio();
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        play();
        gate.classList.add('fade-out');
        setTimeout(()=> gate.style.display = 'none', 1000);
        setTimeout(startTypewriterAnimation, 500);
        });

        document.querySelectorAll('button, a, .cta-button').forEach(el => {
            el.addEventListener('mouseenter', () => {
                document.getElementById('cDot').style.opacity = '0';
                document.getElementById('cRing').style.opacity = '0';
            });
            el.addEventListener('mouseleave', () => {
                document.getElementById('cDot').style.opacity = '1';
                document.getElementById('cRing').style.opacity = '1';
            });
        });

        // Also start typewriter later as a fallback
        window.addEventListener('load', ()=>{ setTimeout(startTypewriterAnimation, 1200); });
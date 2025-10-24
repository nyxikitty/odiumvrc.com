// Initialize tsParticles
    tsParticles.load("tsparticles", {
      particles: {
        number: {
          value: 80,
          density: {
            enable: true,
            value_area: 800
          }
        },
        color: {
          value: ["#e91f42", "#ff6b8a", "#ff8fa3"]
        },
        shape: {
          type: "circle"
        },
        opacity: {
          value: 0.5,
          random: true,
          anim: {
            enable: true,
            speed: 1,
            opacity_min: 0.1,
            sync: false
          }
        },
        size: {
          value: 3,
          random: true,
          anim: {
            enable: true,
            speed: 2,
            size_min: 0.1,
            sync: false
          }
        },
        line_linked: {
          enable: true,
          distance: 150,
          color: "#e91f42",
          opacity: 0.2,
          width: 1
        },
        move: {
          enable: true,
          speed: 1,
          direction: "none",
          random: false,
          straight: false,
          out_mode: "out",
          bounce: false,
          attract: {
            enable: false,
            rotateX: 600,
            rotateY: 1200
          }
        }
      },
      interactivity: {
        detect_on: "canvas",
        events: {
          onhover: {
            enable: true,
            mode: "grab"
          },
          onclick: {
            enable: true,
            mode: "push"
          },
          resize: true
        },
        modes: {
          grab: {
            distance: 140,
            line_linked: {
              opacity: 0.5
            }
          },
          push: {
            particles_nb: 4
          }
        }
      },
      retina_detect: true
    });

    // Custom cursor
    const cursorDot = document.querySelector('.cursor-dot');
    let mouseX = 0, mouseY = 0;
    let cursorX = 0, cursorY = 0;
    let lastTrailTime = 0;

    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      // Trail effect
      const now = Date.now();
      if (now - lastTrailTime > 30) {
        createTrail(mouseX, mouseY);
        lastTrailTime = now;
      }
    });

    document.addEventListener('mousedown', () => {
      cursorDot.classList.add('beat');
    });

    document.addEventListener('mouseup', () => {
      cursorDot.classList.remove('beat');
    });

    function animateCursor() {
      cursorX += (mouseX - cursorX) * 0.2;
      cursorY += (mouseY - cursorY) * 0.2;
      
      cursorDot.style.left = cursorX + 'px';
      cursorDot.style.top = cursorY + 'px';
      
      requestAnimationFrame(animateCursor);
    }
    animateCursor();

    function createTrail(x, y) {
      const trail = document.createElement('div');
      trail.className = 'trail-particle trail-snow';
      trail.style.left = x + 'px';
      trail.style.top = y + 'px';
      document.body.appendChild(trail);
      
      setTimeout(() => trail.remove(), 1200);
    }

    // Form logic
    let isRegisterMode = false;
    const formTitle = document.getElementById('form-title');
    const submitBtn = document.getElementById('submit-btn');
    const toggleText = document.getElementById('toggle-text');
    const toggleLink = document.getElementById('toggle-link');
    const errorMsg = document.getElementById('error-msg');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    toggleLink.addEventListener('click', (e) => {
      e.preventDefault();
      isRegisterMode = !isRegisterMode;
      
      if (isRegisterMode) {
        formTitle.textContent = 'JOIN THE COLLECTIVE';
        submitBtn.textContent = 'REGISTER';
        toggleText.textContent = "Already have an account?";
        toggleLink.textContent = 'Login';
      } else {
        formTitle.textContent = 'ENTER THE REALM';
        submitBtn.textContent = 'LOGIN';
        toggleText.textContent = "Don't have an account?";
        toggleLink.textContent = 'Register';
      }
      
      errorMsg.classList.remove('show');
    });

    function showError(message) {
      errorMsg.textContent = message;
      errorMsg.classList.add('show');
      setTimeout(() => errorMsg.classList.remove('show'), 5000);
    }

    async function handleSubmit() {
      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();

      if (!username || !password) {
        showError('Username and password are required');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = isRegisterMode ? 'REGISTERING...' : 'LOGGING IN...';

      try {
        const endpoint = isRegisterMode ? '/api/auth/register' : '/api/auth/login';
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
          window.location.href = '/forum';
        } else {
          showError(data.error || 'Authentication failed');
          submitBtn.disabled = false;
          submitBtn.textContent = isRegisterMode ? 'REGISTER' : 'LOGIN';
        }
      } catch (error) {
        showError('Network error. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = isRegisterMode ? 'REGISTER' : 'LOGIN';
      }
    }

    submitBtn.addEventListener('click', handleSubmit);

    [usernameInput, passwordInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleSubmit();
        }
      });
    });
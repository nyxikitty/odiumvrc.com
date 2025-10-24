    const cursorDot = document.querySelector('.cursor-dot');
    let mouseX = 0, mouseY = 0, cursorX = 0, cursorY = 0, lastTrailTime = 0;

    document.addEventListener('mousemove', (e) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
      const now = Date.now();
      if (now - lastTrailTime > 30) {
        createTrail(mouseX, mouseY);
        lastTrailTime = now;
      }
    });

    document.addEventListener('mousedown', () => cursorDot.classList.add('beat'));
    document.addEventListener('mouseup', () => cursorDot.classList.remove('beat'));

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
      trail.className = 'trail-particle';
      trail.style.left = x + 'px';
      trail.style.top = y + 'px';
      document.body.appendChild(trail);
      setTimeout(() => trail.remove(), 1200);
    }

    tsParticles.load("tsparticles", {
      particles: {
        number: { value: 80, density: { enable: true, value_area: 800 } },
        color: { value: ["#e91f42", "#ff6b8a", "#ff8fa3"] },
        shape: { type: "circle" },
        opacity: {
          value: 0.5,
          random: true,
          anim: { enable: true, speed: 1, opacity_min: 0.1, sync: false }
        },
        size: {
          value: 3,
          random: true,
          anim: { enable: true, speed: 2, size_min: 0.1, sync: false }
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
          bounce: false
        }
      },
      interactivity: {
        detect_on: "canvas",
        events: {
          onhover: { enable: true, mode: "grab" },
          onclick: { enable: true, mode: "push" },
          resize: true
        },
        modes: {
          grab: { distance: 140, line_linked: { opacity: 0.5 } },
          push: { particles_nb: 4 }
        }
      },
      retina_detect: true
    });

    const errorMsg = document.getElementById('error-msg');
    const submitBtn = document.getElementById('submit-btn');
    const verifyBtn = document.getElementById('verify-btn');
    const resendBtn = document.getElementById('resend-btn');
    const inviteKeyInput = document.getElementById('invite-key');
    const usernameInput = document.getElementById('username');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirm-password');
    const verificationCodeInput = document.getElementById('verification-code');
    const registerForm = document.getElementById('register-form');
    const verificationForm = document.getElementById('verification-form');

    let currentEmail = '';

    inviteKeyInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase();
    });

    function showError(message) {
      errorMsg.textContent = message;
      errorMsg.classList.add('show');
      setTimeout(() => errorMsg.classList.remove('show'), 5000);
    }

    function showSuccess(message) {
      errorMsg.style.background = 'rgba(76, 175, 80, 0.2)';
      errorMsg.style.borderColor = '#4CAF50';
      errorMsg.style.color = '#4CAF50';
      errorMsg.textContent = message;
      errorMsg.classList.add('show');
      setTimeout(() => {
        errorMsg.classList.remove('show');
        errorMsg.style.background = 'rgba(233, 31, 66, 0.2)';
        errorMsg.style.borderColor = '#e91f42';
        errorMsg.style.color = '#ff6b8a';
      }, 5000);
    }

    async function handleSubmit() {
      const inviteKey = inviteKeyInput.value.trim();
      const username = usernameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value.trim();
      const confirmPassword = confirmPasswordInput.value.trim();

      if (!inviteKey || !username || !email || !password || !confirmPassword) {
        showError('All fields are required');
        return;
      }

      if (username.length < 3 || username.length > 20) {
        showError('Username must be 3-20 characters');
        return;
      }

      if (password.length < 6) {
        showError('Password must be at least 6 characters');
        return;
      }

      if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showError('Please enter a valid email');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'SENDING CODE...';

      try {
        const response = await fetch('/api/auth/register/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, email, inviteKey })
        });

        const data = await response.json();

        if (response.ok) {
          currentEmail = email;
          registerForm.style.display = 'none';
          verificationForm.style.display = 'block';
          showSuccess('Verification code sent! Check your email.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'SEND VERIFICATION CODE';
        } else {
          showError(data.error || 'Registration failed');
          submitBtn.disabled = false;
          submitBtn.textContent = 'SEND VERIFICATION CODE';
        }
      } catch (error) {
        showError('Network error. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'SEND VERIFICATION CODE';
      }
    }

    async function handleVerify() {
      const code = verificationCodeInput.value.trim();

      if (!code || code.length !== 6) {
        showError('Please enter the 6-digit verification code');
        return;
      }

      verifyBtn.disabled = true;
      verifyBtn.textContent = 'VERIFYING...';

      try {
        const response = await fetch('/api/auth/register/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: currentEmail, code })
        });

        const data = await response.json();

        if (response.ok) {
          showSuccess('Account created successfully! Redirecting...');
          setTimeout(() => {
            window.location.href = '/forum';
          }, 1500);
        } else {
          showError(data.error || 'Verification failed');
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'VERIFY & CREATE ACCOUNT';
        }
      } catch (error) {
        showError('Network error. Please try again.');
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'VERIFY & CREATE ACCOUNT';
      }
    }

    async function handleResend() {
      resendBtn.disabled = true;
      resendBtn.textContent = 'RESENDING...';

      const username = usernameInput.value.trim();
      const password = passwordInput.value.trim();
      const inviteKey = inviteKeyInput.value.trim();

      try {
        const response = await fetch('/api/auth/register/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, email: currentEmail, inviteKey })
        });

        if (response.ok) {
          showSuccess('New verification code sent!');
        } else {
          showError('Failed to resend code');
        }
      } catch (error) {
        showError('Network error');
      } finally {
        resendBtn.disabled = false;
        resendBtn.textContent = 'RESEND CODE';
      }
    }

    submitBtn.addEventListener('click', handleSubmit);
    verifyBtn.addEventListener('click', handleVerify);
    resendBtn.addEventListener('click', handleResend);

    [inviteKeyInput, usernameInput, emailInput, passwordInput, confirmPasswordInput].forEach(input => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleSubmit();
        }
      });
    });

    verificationCodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleVerify();
      }
    });
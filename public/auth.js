// Simple passcode authentication
// This runs before the main app loads

(function() {
  const PASSCODE = '7536'; // Hardcoded passcode
  const AUTH_KEY = 'voice_app_authenticated';
  const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  // Check if user is already authenticated
  function isAuthenticated() {
    const authData = localStorage.getItem(AUTH_KEY);
    if (!authData) return false;

    try {
      const { timestamp } = JSON.parse(authData);
      const now = Date.now();

      // Check if session is still valid (24 hours)
      if (now - timestamp < SESSION_DURATION) {
        return true;
      } else {
        // Session expired, clear it
        localStorage.removeItem(AUTH_KEY);
        return false;
      }
    } catch (e) {
      localStorage.removeItem(AUTH_KEY);
      return false;
    }
  }

  // Set authentication
  function setAuthenticated() {
    const authData = {
      timestamp: Date.now()
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
  }

  // Show passcode modal
  function showPasscodeModal() {
    // Inject styles
    const style = document.createElement('style');
    style.textContent = `
      .passcode-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      }

      .passcode-modal {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border-radius: 24px;
        padding: 48px 40px;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        text-align: center;
      }

      .passcode-modal h2 {
        margin: 0 0 12px 0;
        font-size: 24px;
        font-weight: 600;
        color: #1a1a1a;
      }

      .passcode-modal p {
        margin: 0 0 32px 0;
        color: #666;
        font-size: 14px;
      }

      .passcode-input-container {
        display: flex;
        gap: 12px;
        justify-content: center;
        margin-bottom: 24px;
      }

      .passcode-digit {
        width: 60px;
        height: 70px;
        font-size: 32px;
        font-weight: 600;
        text-align: center;
        border: 2px solid #e0e0e0;
        border-radius: 12px;
        background: white;
        color: #1a1a1a;
        outline: none;
        transition: all 0.2s ease;
      }

      .passcode-digit:focus {
        border-color: #1a73e8;
        box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.1);
      }

      .passcode-error {
        color: #e53e3e;
        font-size: 14px;
        margin-top: 16px;
        min-height: 20px;
        font-weight: 500;
      }

      .passcode-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 24px;
        color: #1a73e8;
      }

      @media (max-width: 480px) {
        .passcode-modal {
          padding: 36px 24px;
        }

        .passcode-digit {
          width: 50px;
          height: 60px;
          font-size: 28px;
        }

        .passcode-input-container {
          gap: 8px;
        }
      }
    `;
    document.head.appendChild(style);

    // Create modal HTML
    const overlay = document.createElement('div');
    overlay.className = 'passcode-overlay';
    overlay.innerHTML = `
      <div class="passcode-modal">
        <svg class="passcode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <h2>Enter Passcode</h2>
        <p>Enter the 4-digit passcode to access the app</p>
        <div class="passcode-input-container">
          <input type="tel" maxlength="1" class="passcode-digit" id="digit1" autocomplete="off" inputmode="numeric" pattern="[0-9]*">
          <input type="tel" maxlength="1" class="passcode-digit" id="digit2" autocomplete="off" inputmode="numeric" pattern="[0-9]*">
          <input type="tel" maxlength="1" class="passcode-digit" id="digit3" autocomplete="off" inputmode="numeric" pattern="[0-9]*">
          <input type="tel" maxlength="1" class="passcode-digit" id="digit4" autocomplete="off" inputmode="numeric" pattern="[0-9]*">
        </div>
        <div class="passcode-error" id="passcode-error"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Setup input handlers
    const digit1 = document.getElementById('digit1');
    const digit2 = document.getElementById('digit2');
    const digit3 = document.getElementById('digit3');
    const digit4 = document.getElementById('digit4');
    const errorEl = document.getElementById('passcode-error');

    const digits = [digit1, digit2, digit3, digit4];

    // Auto-focus first input
    setTimeout(() => digit1.focus(), 100);

    // Handle input
    digits.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        const value = e.target.value;

        // Only allow numbers
        if (value && !/^\d$/.test(value)) {
          e.target.value = '';
          return;
        }

        // Move to next input
        if (value && index < 3) {
          digits[index + 1].focus();
        }

        // Check passcode when all 4 digits are entered
        if (index === 3 && value) {
          checkPasscode();
        }
      });

      // Handle backspace
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && index > 0) {
          digits[index - 1].focus();
        }
      });

      // Handle paste
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').trim();

        if (/^\d{4}$/.test(pastedData)) {
          pastedData.split('').forEach((char, i) => {
            if (digits[i]) {
              digits[i].value = char;
            }
          });
          digits[3].focus();
          checkPasscode();
        }
      });
    });

    function checkPasscode() {
      const enteredPasscode = digits.map(d => d.value).join('');

      if (enteredPasscode === PASSCODE) {
        // Correct passcode
        errorEl.textContent = '';
        setAuthenticated();

        // Fade out and remove overlay
        overlay.style.transition = 'opacity 0.3s ease';
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
        }, 300);
      } else {
        // Wrong passcode
        errorEl.textContent = 'Incorrect passcode. Please try again.';

        // Shake animation
        overlay.querySelector('.passcode-modal').style.animation = 'shake 0.5s ease';

        // Clear inputs after a delay
        setTimeout(() => {
          digits.forEach(d => d.value = '');
          digit1.focus();
        }, 500);
      }
    }

    // Add shake animation
    const shakeStyle = document.createElement('style');
    shakeStyle.textContent = `
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        10%, 30%, 50%, 70%, 90% { transform: translateX(-10px); }
        20%, 40%, 60%, 80% { transform: translateX(10px); }
      }
    `;
    document.head.appendChild(shakeStyle);
  }

  // Check authentication on page load
  function init() {
    if (!isAuthenticated()) {
      showPasscodeModal();
    }
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM is already ready
    init();
  }
})();

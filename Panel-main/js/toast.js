// ============================================================================
// TOAST MODULE - Notifications
// ============================================================================
const Toast = {
  container: null,

  init() {
    Toast.container = document.getElementById('toastContainer');
  },

  show(message, type = 'success', duration = 3000) {
    if (!Toast.container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    
    const iconMap = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };

    toast.innerHTML = `
      <span class="toast__icon">
        <i class="fa-solid ${iconMap[type] || iconMap.info}"></i>
      </span>
      <span class="toast__message">${Utils.escapeHtml(message)}</span>
      <button class="toast__close" aria-label="Chiudi notifica">
        <i class="fa-solid fa-times"></i>
      </button>
    `;

    const closeBtn = toast.querySelector('.toast__close');
    closeBtn.addEventListener('click', () => {
      toast.remove();
    });

    Toast.container.appendChild(toast);

    if (duration > 0) {
      setTimeout(() => {
        toast.remove();
      }, duration);
    }
  },

  success(message) { Toast.show(message, 'success'); },
  error(message) { Toast.show(message, 'error'); },
  warning(message) { Toast.show(message, 'warning'); },
  info(message) { Toast.show(message, 'info'); }
};


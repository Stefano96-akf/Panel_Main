// ============================================================================
// ALERT DIALOG MODULE - Confirm actions with app modal
// ============================================================================
const AlertDialog = {
  confirmDelete({ title = 'Conferma eliminazione', message = 'Sei sicuro di voler eliminare questo elemento?', onConfirm }) {
    const content = `
      <div class="form-group">
        <p class="modal-alert-text">${Utils.escapeHtml(message)}</p>
      </div>
    `;

    Modal.open(title, content, () => {
      if (typeof onConfirm === 'function') {
        onConfirm();
      }
      return true;
    }, { confirmLabel: 'Conferma', danger: true });
  }
};

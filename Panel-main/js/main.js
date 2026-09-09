// ============================================================================
// INITIALIZATION
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  Storage.migrateToSession(); // cloud: sposta dati legacy da localStorage a sessionStorage
  Toast.init();
  Modal.init();
  UI.init();
  SidebarNav.init();
});


























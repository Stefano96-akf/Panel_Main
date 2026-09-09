// ============================================================================
// SIDEBAR NAV MODULE - Vertical navigation with accessibility
// ============================================================================
const SidebarNav = {
  keyCollapsed: Storage.keys.sidebarCollapsed,
  elements: {
    sidebar: null,
    toggle: null,
    links: []
  },
  pages: [],
  init() {
    SidebarNav.elements.sidebar = document.getElementById('appSidebar');
    SidebarNav.elements.toggle = document.getElementById('sidebarToggle');
    SidebarNav.elements.links = Array.from(document.querySelectorAll('.app-sidebar__link[data-nav-target]'));
    if (!SidebarNav.elements.sidebar || !SidebarNav.elements.toggle || SidebarNav.elements.links.length === 0) {
      return;
    }
    SidebarNav.pages = Array.from(document.querySelectorAll('.container .page'));
    SidebarNav.restoreState();
    SidebarNav.bindToggle();
    SidebarNav.bindLinks();
    SidebarNav.bindRouting();
    SidebarNav.bindOutsideClose();
    // Bottone "Skelly AI" nell'header → apre la sezione Skelly
    document.getElementById('skellyOpen')?.addEventListener('click', () => SidebarNav.showPage('section-skelly'));
  },
  isMobile() {
    return window.matchMedia('(max-width: 1024px)').matches;
  },
  restoreState() {
    const isCollapsed = Storage.get(SidebarNav.keyCollapsed) === 'true';
    if (isCollapsed && !SidebarNav.isMobile()) {
      document.body.classList.add('sidebar-collapsed');
    }
    SidebarNav.updateToggleAria();
  },
  bindToggle() {
    SidebarNav.elements.toggle.addEventListener('click', () => {
      if (SidebarNav.isMobile()) {
        document.body.classList.toggle('sidebar-open');
      } else {
        document.body.classList.toggle('sidebar-collapsed');
        Storage.set(SidebarNav.keyCollapsed, document.body.classList.contains('sidebar-collapsed') ? 'true' : 'false');
      }
      SidebarNav.updateToggleAria();
    });
    window.addEventListener('resize', Utils.debounce(() => {
      if (!SidebarNav.isMobile()) {
        document.body.classList.remove('sidebar-open');
      }
      SidebarNav.updateToggleAria();
    }, 120));
  },
  bindLinks() {
    SidebarNav.elements.links.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.dataset.navTarget;
        if (!document.getElementById(targetId)) return;
        if (location.hash === '#' + targetId) {
          SidebarNav.route();          // stesso hash: forza comunque lo switch
        } else {
          location.hash = targetId;    // → hashchange → route()
        }
      });
    });
  },
  // Routing a pagine (hash-based): mostra una sola sezione per volta.
  bindRouting() {
    window.addEventListener('hashchange', () => SidebarNav.route());
    SidebarNav.route(); // stato iniziale (da hash o pagina di default)
  },
  validTarget(id) {
    return !!id
      && SidebarNav.elements.links.some(l => l.dataset.navTarget === id)
      && !!document.getElementById(id);
  },
  route() {
    let id = (location.hash || '').replace(/^#/, '');
    if (!SidebarNav.validTarget(id)) {
      id = SidebarNav.elements.links[0]?.dataset.navTarget;
    }
    if (id) SidebarNav.showPage(id);
  },
  showPage(targetId) {
    (SidebarNav.pages || []).forEach(page => {
      page.classList.toggle('is-active', page.id === targetId);
    });
    SidebarNav.setActive(targetId);
    if (targetId === 'section-settings' && window.Settings && Settings.render) Settings.render();
    if (targetId === 'section-notes' && DOM.updateNoteClamps) DOM.updateNoteClamps();
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (SidebarNav.isMobile()) {
      document.body.classList.remove('sidebar-open');
      SidebarNav.updateToggleAria();
    }
  },
  bindOutsideClose() {
    document.addEventListener('click', (e) => {
      if (!SidebarNav.isMobile()) return;
      if (!document.body.classList.contains('sidebar-open')) return;
      const inSidebar = e.target.closest('#appSidebar');
      const isToggle = e.target.closest('#sidebarToggle');
      if (!inSidebar && !isToggle) {
        document.body.classList.remove('sidebar-open');
        SidebarNav.updateToggleAria();
      }
    });
  },
  setActive(targetId) {
    SidebarNav.elements.links.forEach(link => {
      const isActive = link.dataset.navTarget === targetId;
      link.classList.toggle('is-active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
    // Nome in alto (header) = titolo della sezione attiva
    const titleEl = document.querySelector('.header__title');
    const section = document.getElementById(targetId);
    const h2 = section ? section.querySelector('.panel__title') : null;
    if (titleEl && h2) titleEl.textContent = h2.textContent.trim();
  },
  updateToggleAria() {
    const expanded = SidebarNav.isMobile()
      ? document.body.classList.contains('sidebar-open')
      : !document.body.classList.contains('sidebar-collapsed');
    SidebarNav.elements.toggle?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    SidebarNav.elements.toggle?.setAttribute('aria-label', expanded ? 'Chiudi menu navigazione' : 'Apri menu navigazione');
  }
};


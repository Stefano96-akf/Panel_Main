// ============================================================================
// ASSETS MODULE - Asset management (riutilizzabili per elementi)
// ============================================================================
const Assets = {
  getAll() {
    return Storage.get(Storage.keys.assets, []);
  },

  getById(id) {
    return Assets.getAll().find(asset => asset.id === id);
  },

  getByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    return Assets.getAll().filter(asset => ids.includes(asset.id));
  },

  save(asset) {
    const assets = Assets.getAll();
    const name = (asset?.name || '').trim();
    const description = (asset?.description || '').trim();

    if (!name) {
      return { success: false, error: 'Il nome asset e obbligatorio' };
    }

    const duplicate = assets.find(a =>
      (a.name || '').toLowerCase() === name.toLowerCase() && a.id !== asset?.id
    );
    if (duplicate) {
      return { success: false, error: 'Asset con questo nome esiste gia' };
    }

    const payload = {
      id: asset?.id || Utils.generateId(),
      name,
      description,
      createdAt: asset?.createdAt || new Date().toISOString()
    };

    const index = assets.findIndex(a => a.id === payload.id);
    if (index === -1) {
      assets.push(payload);
    } else {
      assets[index] = payload;
    }

    assets.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    Storage.set(Storage.keys.assets, assets);
    return { success: true, asset: payload };
  },

  add(name, description = '') {
    return Assets.save({ name, description });
  },

  getLinkedCount(id) {
    return Clients.getAll().filter(client => (client.assets || []).includes(id)).length;
  },

  delete(id) {
    const filteredAssets = Assets.getAll().filter(asset => asset.id !== id);
    Storage.set(Storage.keys.assets, filteredAssets);

    const clients = Clients.getAll().map(client => ({
      ...client,
      assets: (client.assets || []).filter(assetId => assetId !== id)
    }));
    Clients.save(clients);

    return true;
  },

  renderList(container) {
    if (!container) return;

    const assets = Assets.getAll();
    container.innerHTML = '';

    if (assets.length === 0) {
      container.innerHTML = `
        <div class="assets-list__empty">
          <p>Nessun asset creato</p>
          <p style="font-size: var(--font-size-xs); margin-top: var(--spacing-sm);">Crea il primo asset dal bottone sopra</p>
        </div>
      `;
      return;
    }

    assets.forEach(asset => {
      const linkedCount = Assets.getLinkedCount(asset.id);
      const card = document.createElement('article');
      card.className = 'asset-item asset-card';
      card.innerHTML = `
        <div class="asset-item__info">
          <div class="asset-item__name">${Utils.escapeHtml(asset.name)}</div>
          <div class="asset-item__desc">${Utils.escapeHtml(asset.description || 'Nessuna descrizione')}</div>
          <div class="asset-item__meta">Collegato a ${linkedCount} ${linkedCount === 1 ? 'elemento' : 'elementi'}</div>
        </div>
        <div class="asset-item__actions">
          <button class="asset-item__action-btn" title="Modifica" data-edit-asset="${asset.id}">
            <i class="fa-solid fa-pen"></i>
            
          </button>
          <button class="asset-item__action-btn asset-item__action-btn--delete" title="Elimina" data-delete-asset="${asset.id}">
            <i class="fa-solid fa-trash"></i>
            
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  },

  renderSelection(container, selectedIds = []) {
    if (!container) return;

    const assets = Assets.getAll();
    if (assets.length === 0) {
      container.innerHTML = `
        <div class="assets-empty-state">
          <p class="assets-empty-state__text">Nessun asset disponibile.</p>
          <p class="assets-empty-state__text">Crea un asset prima di associarlo.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="asset-selection-list" role="group" aria-label="Asset disponibili">
        ${assets.map(asset => `
          <label class="asset-selection-item" for="asset-check-${asset.id}">
            <input
              type="checkbox"
              id="asset-check-${asset.id}"
              class="asset-selection-checkbox"
              value="${asset.id}"
              ${selectedIds.includes(asset.id) ? 'checked' : ''}
            >
            <span class="asset-selection-custom" aria-hidden="true"></span>
            <span class="asset-selection-content">
              <span class="asset-selection-name">${Utils.escapeHtml(asset.name)}</span>
              ${asset.description ? `<span class="asset-selection-desc">${Utils.escapeHtml(asset.description)}</span>` : ''}
            </span>
          </label>
        `).join('')}
      </div>
    `;
  }
};


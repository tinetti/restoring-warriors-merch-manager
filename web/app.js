const state = {
  products: [],
  selectedId: null,
};

const productList = document.getElementById('product-list');
const editor = document.getElementById('editor');
const searchInput = document.getElementById('search');
const familyFilter = document.getElementById('family-filter');
const importTrigger = document.getElementById('import-trigger');
const importFile = document.getElementById('import-file');
const exportButton = document.getElementById('export-button');
const validateButton = document.getElementById('validate-button');
const validationDialog = document.getElementById('validation-dialog');

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error ?? message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response;
}

async function refreshProducts() {
  state.products = await api('/api/products');
  renderProductList();
  if (state.selectedId) {
    const product = state.products.find((entry) => entry.id === state.selectedId);
    if (product) {
      renderEditor(product);
    }
  }
}

function renderProductList() {
  productList.innerHTML = '';
  const query = searchInput.value.trim().toLowerCase();
  const family = familyFilter.value;

  const filtered = state.products.filter((product) => {
    const matchesQuery = !query || product.name.toLowerCase().includes(query);
    const matchesFamily = family === 'ALL' || product.family === family;
    return matchesQuery && matchesFamily;
  });

  for (const product of filtered) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.textContent = `${product.name} (${product.variants.length})`;
    button.addEventListener('click', () => {
      state.selectedId = product.id;
      renderEditor(product);
    });
    item.append(button);
    productList.append(item);
  }
}

function renderEditor(product) {
  editor.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="grid">
      <label class="field">
        <span>Name</span>
        <input id="product-name" value="${escapeHtml(product.name)}" />
      </label>
      <label class="field">
        <span>Family</span>
        <select id="product-family">
          ${['INJES', 'RESTO', 'SNAPB', 'OTHER']
            .map((value) => `<option value="${value}" ${product.family === value ? 'selected' : ''}>${value}</option>`)
            .join('')}
        </select>
      </label>
      <label class="field">
        <span>Status</span>
        <input id="product-status" value="${escapeHtml(product.status)}" />
      </label>
      <label class="field">
        <span>Price</span>
        <input id="product-price" type="number" step="0.01" value="${product.price ?? ''}" />
      </label>
    </div>
    <label class="field">
      <span>Description</span>
      <textarea id="product-description">${escapeHtml(product.aiDescription ?? product.description)}</textarea>
    </label>
    <div class="toolbar">
      <button id="save-product">Save Product</button>
      <button id="regen-skus">Regenerate SKUs</button>
      <button id="ai-rewrite">AI Rewrite</button>
    </div>
    <h2>Variants</h2>
    <table>
      <thead>
        <tr><th>SKU</th><th>Option 1</th><th>Option 2</th><th>Price</th><th></th></tr>
      </thead>
      <tbody id="variant-body"></tbody>
    </table>
    <div class="variant-actions">
      <button id="add-variant" class="secondary">Add Variant</button>
      <button id="price-25" class="secondary">T-Shirt $25</button>
      <button id="price-42" class="secondary">Hoodie $42</button>
      <button id="price-22" class="secondary">Snapback $22</button>
    </div>
    <h2>Images</h2>
    <div class="images" id="image-list"></div>
    <div class="image-toolbar">
      <input id="image-upload" type="file" accept=".jpg,.jpeg,.png,.webp" multiple />
    </div>
    <p class="status" id="product-status-message"></p>
  `;

  editor.append(panel);
  renderVariantRows(product);
  renderImages(product);

  panel.querySelector('#save-product').addEventListener('click', () => saveProduct(product));
  panel.querySelector('#regen-skus').addEventListener('click', () => regenerateSkus(product.id));
  panel.querySelector('#ai-rewrite').addEventListener('click', () => rewriteDescription(product.id));
  panel.querySelector('#add-variant').addEventListener('click', () => addVariant(product));
  panel.querySelector('#price-25').addEventListener('click', () => setProductPrice(25));
  panel.querySelector('#price-42').addEventListener('click', () => setProductPrice(42));
  panel.querySelector('#price-22').addEventListener('click', () => setProductPrice(22));
  panel.querySelector('#image-upload').addEventListener('change', (event) => uploadImages(product.id, event.target.files));
}

function renderVariantRows(product) {
  const body = document.getElementById('variant-body');
  body.innerHTML = '';

  product.variants.forEach((variant, index) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input data-field="sku" data-index="${index}" value="${escapeHtml(variant.sku)}" /></td>
      <td><input data-field="option1Value" data-index="${index}" value="${escapeHtml(variant.option1Value)}" /></td>
      <td><input data-field="option2Value" data-index="${index}" value="${escapeHtml(variant.option2Value)}" /></td>
      <td><input data-field="price" data-index="${index}" type="number" step="0.01" value="${variant.price ?? ''}" /></td>
      <td><button data-delete-variant="${index}" class="secondary">Delete</button></td>
    `;
    body.append(row);
  });

  body.querySelectorAll('input').forEach((input) => {
    input.addEventListener('input', (event) => {
      const target = event.target;
      const index = Number(target.dataset.index);
      const field = target.dataset.field;
      const value = target.type === 'number' ? Number(target.value) : target.value;
      product.variants[index][field] = target.type === 'number' && Number.isNaN(value) ? null : value;
    });
  });

  body.querySelectorAll('[data-delete-variant]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const index = Number(event.target.dataset.deleteVariant);
      product.variants.splice(index, 1);
      renderVariantRows(product);
    });
  });
}

function renderImages(product) {
  const imageList = document.getElementById('image-list');
  imageList.innerHTML = '';
  for (const image of product.images) {
    const chip = document.createElement('div');
    chip.className = 'image-chip';
    chip.textContent = image.isPrimary ? `${image.fileName} ★` : image.fileName;
    imageList.append(chip);
  }
}

async function saveProduct(product) {
  const payload = collectProductPayload(product);
  await api(`/api/products/${product.id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  await refreshProducts();
  setStatus('Saved product changes.');
}

async function regenerateSkus(productId) {
  await api(`/api/products/${productId}/regenerate-sku`, { method: 'POST' });
  await refreshProducts();
  setStatus('Regenerated SKUs.');
}

async function rewriteDescription(productId) {
  const response = await api(`/api/products/${productId}/rewrite-description`, { method: 'POST' });
  const textarea = document.getElementById('product-description');
  textarea.value = response.rewritten;
  setStatus('AI rewrite ready to save.');
}

async function uploadImages(productId, files) {
  if (!files?.length) {
    return;
  }
  const form = new FormData();
  for (const file of files) {
    form.append('files', file);
  }
  await api(`/api/products/${productId}/images`, { method: 'POST', body: form });
  await refreshProducts();
  setStatus('Uploaded images.');
}

function addVariant(product) {
  product.variants.push({
    id: `${product.id}-${crypto.randomUUID()}`,
    parentId: product.id,
    name: `${product.name} new variant`,
    sku: '',
    shortcode: product.shortcode,
    status: product.status,
    price: product.price,
    salePrice: null,
    available: true,
    weight: product.weight,
    weightUnit: product.weightUnit,
    option1Name: 'Color',
    option1Value: '',
    option2Name: 'Size',
    option2Value: '',
    description: '',
  });
  renderVariantRows(product);
}

function setProductPrice(value) {
  const input = document.getElementById('product-price');
  input.value = String(value);
}

function collectProductPayload(product) {
  return {
    ...product,
    name: document.getElementById('product-name').value,
    family: document.getElementById('product-family').value,
    status: document.getElementById('product-status').value,
    price: Number(document.getElementById('product-price').value || 0),
    description: document.getElementById('product-description').value,
    aiDescription: null,
  };
}

async function handleImport() {
  const file = importFile.files?.[0];
  if (!file) {
    return;
  }
  const form = new FormData();
  form.set('file', file);
  await api('/api/products/import', { method: 'POST', body: form });
  await refreshProducts();
  setStatus('Imported CSV.');
}

async function handleExport() {
  const response = await api('/api/products/export', { method: 'POST' });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'godaddy-export.csv';
  link.click();
  URL.revokeObjectURL(url);
}

async function handleValidate() {
  const { issues } = await api('/api/products/validate', { method: 'POST' });
  validationDialog.innerHTML = `
    <h2>Validation</h2>
    <ul>${issues.map((issue) => `<li><strong>${issue.severity}</strong>: ${escapeHtml(issue.message)}</li>`).join('') || '<li>No issues found.</li>'}</ul>
    <form method="dialog"><button>Close</button></form>
  `;
  validationDialog.showModal();
}

function setStatus(message) {
  const status = document.getElementById('product-status-message');
  if (status) {
    status.textContent = message;
  }
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

searchInput.addEventListener('input', renderProductList);
familyFilter.addEventListener('change', renderProductList);
importTrigger.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', handleImport);
exportButton.addEventListener('click', handleExport);
validateButton.addEventListener('click', handleValidate);

refreshProducts().catch((error) => {
  editor.innerHTML = `<div class="panel">${escapeHtml(error.message)}</div>`;
});

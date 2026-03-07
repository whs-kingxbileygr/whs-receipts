/* ══════════════════════════════════════════
   WOLHAIKSONG - Receipts
   Auth : Google
   Data : Cloud Firestore
══════════════════════════════════════════ */

const firebaseConfig = {
  apiKey:            "AIzaSyDmx9Ixu-Pkq5ibbAY9bG1k8fhSqAUwEp8",
  authDomain:        "wolhaiksong-xxi.firebaseapp.com",
  projectId:         "wolhaiksong-xxi",
  storageBucket:     "wolhaiksong-xxi.firebasestorage.app",
  messagingSenderId: "635771818712",
  appId:             "1:635771818712:web:90a44674a84522abcc3dad"
};

firebase.initializeApp(firebaseConfig);
const db   = firebase.firestore();
const auth = firebase.auth();

const THEME_KEY = 'whs_theme';

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function showError(elId, msg) {
  const el = document.getElementById(elId);
  if (el) { el.textContent = msg; el.style.opacity = msg ? '1' : '0'; }
}
function clearMsg(elId) { showError(elId, ''); }

function flash(btn, msg, durationMs = 1800) {
  const orig = btn.innerHTML;
  btn.innerHTML = msg;
  btn.disabled  = true;
  setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, durationMs);
}

function slugify(str) {
  return (str || 'comprobante')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function validateInvoiceData(data) {
  const errors = [];
  if (!data.radioNombre?.trim()) errors.push('El nombre del servicio es requerido');
  if (data.monto && isNaN(parseFloat(data.monto))) errors.push('El monto debe ser un número');
  return errors;
}

function showConfirmDialog(message, title = 'Confirmar acción') {
  return new Promise(resolve => {
    const modal   = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const msgEl   = document.getElementById('confirmMessage');
    const btnYes  = document.getElementById('btnConfirmYes');
    const btnCan  = document.getElementById('btnConfirmCancel');

    titleEl.textContent = title;
    msgEl.textContent   = message;

    const handler = result => {
      modal.classList.remove('open');
      btnYes.removeEventListener('click', onYes);
      btnCan.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onYes    = () => handler(true);
    const onCancel = () => handler(false);

    btnYes.addEventListener('click', onYes);
    btnCan.addEventListener('click', onCancel);
    modal.addEventListener('click', e => { if (e.target === modal) handler(false); });
    modal.classList.add('open');
  });
}

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function formatARS(val) {
  const n = parseFloat(val) || 0;
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatMes(mmaaaa) {
  if (!mmaaaa) return '';
  const [mm, aaaa] = mmaaaa.split('-');
  const m = parseInt(mm, 10);
  if (!aaaa || m < 1 || m > 12) return mmaaaa;
  return MONTHS[m - 1] + ' ' + aaaa;
}

async function compressImage(file, maxSize = 120) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const scale  = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = img.width  * scale;
        canvas.height = img.height * scale;
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ── STATE ──────────────────────────────── */
let currentUser     = null;
let invoiceProfiles = [];
let activeProfileId = null;
let presets         = [];
let activePresetId  = null;
let customQrBase64  = null;
let signatureBase64 = null;

/* ── DOM REFS ───────────────────────────── */
const invoiceProfileModal = document.getElementById('invoiceProfileModal');
const previewModal        = document.getElementById('previewModal');
const mainApp             = document.getElementById('mainApp');

const presetList      = document.getElementById('presetList');
const btnNewPreset    = document.getElementById('btnNewPreset');
const btnSavePreset   = document.getElementById('btnSavePreset');
const btnDeletePreset = document.getElementById('btnDeletePreset');
const btnPreview      = document.getElementById('btnPreview');
const presetNombre    = document.getElementById('presetNombre');

const qrImageInput  = document.getElementById('qrImageInput');
const qrDropArea    = document.getElementById('qrDropArea');
const qrDropInner   = document.getElementById('qrDropInner');
const qrPreviewWrap = document.getElementById('qrPreviewWrap');
const qrPreviewImg  = document.getElementById('qrPreviewImg');
const btnRemoveQr   = document.getElementById('btnRemoveQr');

const sigImageInput  = document.getElementById('sigImageInput');
const sigDropArea    = document.getElementById('sigDropArea');
const sigDropInner   = document.getElementById('sigDropInner');
const sigPreviewWrap = document.getElementById('sigPreviewWrap');
const sigPreviewImg  = document.getElementById('sigPreviewImg');
const btnRemoveSig   = document.getElementById('btnRemoveSig');

const invoiceTpl  = document.getElementById('invoiceTpl');
const captureArea = document.getElementById('captureArea');

const fields = {
  radioNombre:      document.getElementById('radioNombre'),
  radioFrecuencia:  document.getElementById('radioFrecuencia'),
  radioWeb:         document.getElementById('radioWeb'),
  radioDireccion:   document.getElementById('radioDireccion'),
  radioTelefono:    document.getElementById('radioTelefono'),
  radioCorreo:      document.getElementById('radioCorreo'),
  clienteNombre:    document.getElementById('clienteNombre'),
  clienteDireccion: document.getElementById('clienteDireccion'),
  mesPublicidad:    document.getElementById('mesPublicidad'),
  razonCobro:       document.getElementById('razonCobro'),
  monto:            document.getElementById('monto'),
  alias:            document.getElementById('alias'),
  marcaDeAgua:      document.getElementById('marcaDeAgua'),
};

document.addEventListener('DOMContentLoaded', () => {
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

  document.getElementById('btnGoogleLogin').addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => {
      console.error('Login error:', err);
      alert('Error al iniciar sesión: ' + err.message);
    });
  });

  document.getElementById('btnSignOut').addEventListener('click', () => {
    auth.signOut();
  });

  auth.onAuthStateChanged(user => {
    const loading     = document.getElementById('appLoading');
    const loginScreen = document.getElementById('loginScreen');

    if (user) {
      currentUser = user;

      const avatar = document.getElementById('userAvatar');
      const uname  = document.getElementById('userName');
      if (avatar && user.photoURL) avatar.src = user.photoURL;
      if (uname)  uname.textContent = user.displayName || user.email;

      if (loading)     loading.style.display = 'none';
      if (loginScreen) loginScreen.style.display = 'none';
      mainApp.classList.add('visible');

      loadInvoiceProfiles();
    } else {
      currentUser = null;

      if (loading)     loading.style.display = 'none';
      if (loginScreen) loginScreen.style.display = 'flex';
      mainApp.classList.remove('visible');
    }
  });
});

function profilesRef() {
  return db.collection('users').doc(currentUser.uid).collection('profiles');
}
function presetsRef(profileId) {
  return db.collection('users').doc(currentUser.uid)
           .collection('profiles').doc(profileId)
           .collection('presets');
}

async function loadInvoiceProfiles() {
  if (!currentUser) return;
  try {
    const snap = await profilesRef().orderBy('createdAt', 'asc').get();
    invoiceProfiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!activeProfileId && invoiceProfiles.length > 0) {
      activeProfileId = invoiceProfiles[0].id;
    }
    updateActiveProfileDisplay();

    if (activeProfileId) loadPresets();
    else renderPresetList();
  } catch (err) {
    console.error('Error cargando perfiles:', err);
  }
}

function updateActiveProfileDisplay() {
  const profile = invoiceProfiles.find(p => p.id === activeProfileId);
  document.getElementById('activeInvProfileName').textContent = profile ? profile.name : 'Sin perfil';
}

document.getElementById('btnSwitchInvProfile').addEventListener('click', openInvoiceProfileModal);

function openInvoiceProfileModal() {
  renderInvoiceProfileList();
  document.getElementById('newInvProfileName').value = '';
  invoiceProfileModal.classList.add('open');
}

function renderInvoiceProfileList() {
  const list = document.getElementById('invProfileList');
  list.innerHTML = '';

  if (invoiceProfiles.length === 0) {
    const li = document.createElement('li');
    li.style.cssText = 'color:var(--text-muted);font-size:12px;padding:8px;';
    li.textContent = 'No tenés perfiles todavía. Creá uno abajo.';
    list.appendChild(li);
    return;
  }

  invoiceProfiles.forEach(profile => {
    const li = document.createElement('li');
    li.className = 'inv-profile-item' + (profile.id === activeProfileId ? ' active' : '');

    const nameSpan = document.createElement('span');
    nameSpan.className   = 'inv-pi-name';
    nameSpan.textContent = profile.name;

    li.appendChild(document.createTextNode('🏪 '));
    li.appendChild(nameSpan);

    if (profile.id === activeProfileId) {
      const badge = document.createElement('span');
      badge.className   = 'inv-pi-active';
      badge.textContent = 'Activo';
      li.appendChild(badge);
    }

    const delBtn = document.createElement('button');
    delBtn.className   = 'inv-pi-delete';
    delBtn.textContent = '🗑';
    delBtn.title       = 'Eliminar perfil';
    delBtn.addEventListener('click', async e => {
      e.stopPropagation();
      const confirmed = await showConfirmDialog(
        `¿Eliminar el perfil "${profile.name}"? Se borrarán todos sus presets.`,
        'Eliminar perfil'
      );
      if (!confirmed) return;

      try {
        const presSnap = await presetsRef(profile.id).get();
        const batch = db.batch();
        presSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(profilesRef().doc(profile.id));
        await batch.commit();

        if (activeProfileId === profile.id) {
          activeProfileId = null;
          activePresetId  = null;
          fillForm({});
          btnDeletePreset.style.display = 'none';
        }
        await loadInvoiceProfiles();
        renderInvoiceProfileList();
      } catch (err) {
        console.error('Error eliminando perfil:', err);
        alert('Error al eliminar el perfil.');
      }
    });
    li.appendChild(delBtn);

    li.addEventListener('click', () => {
      activeProfileId = profile.id;
      activePresetId  = null;
      fillForm({});
      btnDeletePreset.style.display = 'none';
      updateActiveProfileDisplay();
      loadPresets();
      invoiceProfileModal.classList.remove('open');
    });

    list.appendChild(li);
  });
}

document.getElementById('btnCreateInvProfile').addEventListener('click', async () => {
  const name  = document.getElementById('newInvProfileName').value.trim();
  const errEl = document.getElementById('invProfileError');
  if (errEl) errEl.textContent = '';

  if (!name) { if (errEl) errEl.textContent = 'Por favor ingresá un nombre.'; return; }
  if (name.length > 100) { if (errEl) errEl.textContent = 'Máximo 100 caracteres.'; return; }
  if (invoiceProfiles.some(p => p.name.toLowerCase() === name.toLowerCase())) {
    if (errEl) errEl.textContent = 'Ya existe un perfil con este nombre.';
    return;
  }

  try {
    const docRef = await profilesRef().add({ name, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    const newProfile = { id: docRef.id, name };
    invoiceProfiles.push(newProfile);
    activeProfileId = docRef.id;
    activePresetId  = null;
    document.getElementById('newInvProfileName').value = '';
    updateActiveProfileDisplay();
    await loadPresets();
    renderInvoiceProfileList();
  } catch (err) {
    console.error('Error creando perfil:', err);
    if (errEl) errEl.textContent = 'Error al crear el perfil.';
  }
});

document.getElementById('btnCloseInvoiceProfile').addEventListener('click', () => invoiceProfileModal.classList.remove('open'));
invoiceProfileModal.addEventListener('click', e => { if (e.target === invoiceProfileModal) invoiceProfileModal.classList.remove('open'); });

async function loadPresets() {
  if (!activeProfileId || !currentUser) { presets = []; renderPresetList(); return; }
  try {
    const snap = await presetsRef(activeProfileId).orderBy('createdAt', 'asc').get();
    presets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPresetList();
  } catch (err) {
    console.error('Error cargando presets:', err);
  }
}

function renderPresetList() {
  presetList.innerHTML = '';

  if (!activeProfileId) {
    const li = document.createElement('li');
    li.style.cssText = 'color:var(--text-muted);font-size:12px;padding:8px 12px;';
    li.textContent = 'Seleccioná un perfil para ver los presets.';
    presetList.appendChild(li);
    return;
  }

  if (presets.length === 0) {
    const li = document.createElement('li');
    li.style.cssText = 'color:var(--text-muted);font-size:12px;padding:8px 12px;';
    li.textContent = 'Sin presets guardados';
    presetList.appendChild(li);
    return;
  }

  presets.forEach(p => {
    const li = document.createElement('li');
    li.className   = 'preset-item' + (p.id === activePresetId ? ' active' : '');
    li.textContent = p.name;
    li.dataset.id  = p.id;
    li.addEventListener('click', () => loadPreset(p));
    presetList.appendChild(li);
  });
}

function loadPreset(preset) {
  activePresetId = preset.id;
  fillForm(preset.data);
  btnDeletePreset.style.display = 'inline-block';
  renderPresetList();
}

btnSavePreset.addEventListener('click', async () => {
  if (!activeProfileId) {
    alert('Por favor seleccioná o creá un perfil primero.');
    openInvoiceProfileModal();
    return;
  }

  const presetName = presetNombre.value.trim();
  if (!presetName) { alert('Por favor ingresá un nombre para el preset.'); presetNombre.focus(); return; }
  if (presetName.length > 100) { alert('El nombre no puede exceder 100 caracteres.'); return; }

  const data   = readForm();
  const errors = validateInvoiceData(data);
  if (errors.length > 0) {
    if (!confirm('Advertencias:\n' + errors.join('\n') + '\n\n¿Deseas guardar igualmente?')) return;
  }

  flash(btnSavePreset, '⏳ Guardando...', 8000);

  try {
    if (activePresetId) {
      await presetsRef(activeProfileId).doc(activePresetId).update({ name: presetName, data });
      const idx = presets.findIndex(p => p.id === activePresetId);
      if (idx !== -1) presets[idx] = { ...presets[idx], name: presetName, data };
    } else {
      const docRef = await presetsRef(activeProfileId).add({
        name: presetName,
        data,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      activePresetId = docRef.id;
      presets.push({ id: docRef.id, name: presetName, data });
    }

    renderPresetList();
    btnDeletePreset.style.display = 'inline-block';
    flash(btnSavePreset, '✅ Guardado');
  } catch (err) {
    console.error('Error guardando preset:', err);
    flash(btnSavePreset, '❌ Error');
  }
});

btnDeletePreset.addEventListener('click', async () => {
  if (!activePresetId) return;
  const confirmed = await showConfirmDialog('¿Eliminar este preset? Esta acción no se puede deshacer.', 'Eliminar preset');
  if (!confirmed) return;

  try {
    await presetsRef(activeProfileId).doc(activePresetId).delete();
    presets = presets.filter(p => p.id !== activePresetId);
    activePresetId = null;
    renderPresetList();
    fillForm({});
    btnDeletePreset.style.display = 'none';
    flash(btnDeletePreset, '✅ Eliminado');
  } catch (err) {
    console.error('Error eliminando preset:', err);
    alert('Error al eliminar el preset.');
  }
});

btnNewPreset.addEventListener('click', () => {
  activePresetId = null;
  fillForm({});
  btnDeletePreset.style.display = 'none';
  renderPresetList();
  presetNombre.focus();
});

function readForm() {
  const data = {};
  for (const [key, el] of Object.entries(fields)) data[key] = el.value.trim();
  data.presetNombre = presetNombre.value.trim();
  data.customQr     = customQrBase64  || null;
  data.signatureB64 = signatureBase64 || null;
  return data;
}

function fillForm(data = {}) {
  for (const [key, el] of Object.entries(fields)) el.value = data[key] || '';
  presetNombre.value = data.presetNombre || '';
  setCustomQr(data.customQr || null);
  setSignature(data.signatureB64 || null);
}

function setCustomQr(base64) {
  customQrBase64 = base64;
  if (base64) {
    qrPreviewImg.src            = base64;
    qrPreviewWrap.style.display = 'flex';
    qrDropInner.querySelector('.qr-drop-text').textContent = '✅ QR cargado';
  } else {
    qrPreviewImg.src            = '';
    qrPreviewWrap.style.display = 'none';
    rebuildQrDropText();
  }
}

function rebuildQrDropText() {
  const dropText = qrDropInner.querySelector('.qr-drop-text');
  dropText.innerHTML = '';
  dropText.appendChild(document.createTextNode('Arrastrá tu QR aquí o '));
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn-link'; btn.textContent = 'seleccioná un archivo';
  btn.addEventListener('click', () => qrImageInput.click());
  dropText.appendChild(btn);
}

function handleQrFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = e => setCustomQr(e.target.result);
  reader.readAsDataURL(file);
}

document.getElementById('btnBrowseQr').addEventListener('click', () => qrImageInput.click());
qrImageInput.addEventListener('change', e => handleQrFile(e.target.files[0]));
btnRemoveQr.addEventListener('click',   () => setCustomQr(null));
qrDropArea.addEventListener('click', e => { if (e.target.classList.contains('btn-link')) return; qrImageInput.click(); });
qrDropArea.addEventListener('dragover',  e => { e.preventDefault(); qrDropArea.classList.add('drag-over'); });
qrDropArea.addEventListener('dragleave', () => qrDropArea.classList.remove('drag-over'));
qrDropArea.addEventListener('drop', e => {
  e.preventDefault(); qrDropArea.classList.remove('drag-over');
  handleQrFile(e.dataTransfer.files[0]);
});

function removeBackground(src) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const d = imageData.data;

      function getCornerColor(x, y) {
        const i = (y * canvas.width + x) * 4;
        return [d[i], d[i+1], d[i+2]];
      }
      const corners = [
        getCornerColor(0, 0),
        getCornerColor(canvas.width - 1, 0),
        getCornerColor(0, canvas.height - 1),
        getCornerColor(canvas.width - 1, canvas.height - 1),
      ];
      const avgBg = corners.reduce((acc, c) => [acc[0]+c[0], acc[1]+c[1], acc[2]+c[2]], [0,0,0])
                           .map(v => v / corners.length);
      const tolerance = 55;

      for (let i = 0; i < d.length; i += 4) {
        const dr = Math.abs(d[i]   - avgBg[0]);
        const dg = Math.abs(d[i+1] - avgBg[1]);
        const db = Math.abs(d[i+2] - avgBg[2]);
        if (dr < tolerance && dg < tolerance && db < tolerance) d[i+3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

function setSignature(base64) {
  signatureBase64 = base64;
  if (base64) {
    sigPreviewImg.src            = base64;
    sigPreviewWrap.style.display = 'flex';
    sigDropInner.querySelector('.qr-drop-text').textContent = '✅ Firma cargada';
  } else {
    sigPreviewImg.src            = '';
    sigPreviewWrap.style.display = 'none';
    rebuildSigDropText();
  }
}

function rebuildSigDropText() {
  const dropText = sigDropInner.querySelector('.qr-drop-text');
  dropText.innerHTML = '';
  dropText.appendChild(document.createTextNode('Arrastrá la firma aquí o '));
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn-link'; btn.textContent = 'seleccioná un archivo';
  btn.addEventListener('click', () => sigImageInput.click());
  dropText.appendChild(btn);
}

async function handleSigFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  const reader = new FileReader();
  reader.onload = async e => {
    sigDropInner.querySelector('.qr-drop-text').textContent = '⏳ Procesando...';
    const cleaned = await removeBackground(e.target.result);
    setSignature(cleaned);
  };
  reader.readAsDataURL(file);
}

document.getElementById('btnBrowseSig').addEventListener('click', () => sigImageInput.click());
sigImageInput.addEventListener('change', e => handleSigFile(e.target.files[0]));
btnRemoveSig.addEventListener('click',   () => setSignature(null));
sigDropArea.addEventListener('click', e => { if (e.target.classList.contains('btn-link')) return; sigImageInput.click(); });
sigDropArea.addEventListener('dragover',  e => { e.preventDefault(); sigDropArea.classList.add('drag-over'); });
sigDropArea.addEventListener('dragleave', () => sigDropArea.classList.remove('drag-over'));
sigDropArea.addEventListener('drop', e => {
  e.preventDefault(); sigDropArea.classList.remove('drag-over');
  handleSigFile(e.dataTransfer.files[0]);
});

fields.mesPublicidad.addEventListener('input', function () {
  let v = this.value.replace(/\D/g, '');
  if (v.length > 2) v = v.slice(0, 2) + '-' + v.slice(2, 6);
  this.value = v;
  if (v.length === 7) {
    const m = parseInt(v.split('-')[0], 10);
    this.style.borderColor = (m < 1 || m > 12) ? 'var(--danger)' : '';
    this.title = (m < 1 || m > 12) ? 'Mes inválido (01-12)' : '';
  }
});

fields.monto.addEventListener('input', function () {
  const val = parseFloat(this.value);
  if (this.value && isNaN(val)) {
    this.style.borderColor = 'var(--danger)';
    this.title = 'Debe ser un número válido';
  } else {
    this.style.borderColor = '';
    this.title = '';
  }
});

function renderInvoice(data, containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const clone = invoiceTpl.content.cloneNode(true);

  const wrapper = clone.querySelector('.invoice-wrapper');
  if (wrapper && data.marcaDeAgua && data.marcaDeAgua.trim()) {
    const encoded = encodeURIComponent(data.marcaDeAgua.trim());
    const svg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='740' height='500'%3E%3Ctext x='168' y='168' font-family='Arial' font-size='46' font-weight='900' fill='rgba(0,0,0,0.08)' text-anchor='middle' transform='rotate(-35 168 168)' letter-spacing='3'%3E${encoded}%3C/text%3E%3Ctext x='370' y='280' font-family='Arial' font-size='46' font-weight='900' fill='rgba(0,0,0,0.08)' text-anchor='middle' transform='rotate(-35 370 280)' letter-spacing='3'%3E${encoded}%3C/text%3E%3Ctext x='572' y='392' font-family='Arial' font-size='46' font-weight='900' fill='rgba(0,0,0,0.08)' text-anchor='middle' transform='rotate(-35 572 392)' letter-spacing='3'%3E${encoded}%3C/text%3E%3C/svg%3E")`;
    wrapper.style.backgroundImage    = svg;
    wrapper.style.backgroundRepeat   = 'no-repeat';
    wrapper.style.backgroundSize     = '740px 500px';
    wrapper.style.backgroundPosition = 'center center';
  } else if (wrapper) {
    wrapper.style.backgroundImage = 'none';
  }

  const fillMap = {
    radioNombre:      data.radioNombre     || '',
    radioFrecuencia:  data.radioFrecuencia || '',
    radioWeb:         data.radioWeb        || '',
    clienteNombre:    data.clienteNombre   || '',
    clienteDireccion: data.clienteDireccion|| '',
    mesPublicidad:    formatMes(data.mesPublicidad),
    razonCobro:       data.razonCobro      || '',
    monto:            formatARS(data.monto),
    total:            formatARS(data.monto),
    radioDireccion:   data.radioDireccion  || '',
    radioTelefono:    data.radioTelefono   || '',
    radioCorreo:      data.radioCorreo     || '',
  };

  clone.querySelectorAll('[data-inv]').forEach(el => {
    const key = el.dataset.inv;
    if (key in fillMap) el.textContent = fillMap[key];
  });

  const qrSlot = clone.querySelector('[data-inv-slot="qr"]');
  if (data.customQr) {
    const img         = document.createElement('img');
    img.src           = data.customQr;
    img.style.cssText = 'width:100px;height:100px;object-fit:contain;display:block';
    qrSlot.appendChild(img);
    if (data.alias) {
      const aliasEl       = document.createElement('div');
      aliasEl.className   = 'inv-qr-alias';
      aliasEl.textContent = data.alias;
      qrSlot.appendChild(aliasEl);
    }
  } else {
    const noQr = document.createElement('span');
    noQr.textContent   = 'Sin QR';
    noQr.style.cssText = 'font-size:11px;color:#999;text-align:center';
    qrSlot.appendChild(noQr);
  }

  const sigSlot = clone.querySelector('[data-inv-slot="signature"]');
  if (data.signatureB64 && sigSlot) {
    const img = document.createElement('img');
    img.src = data.signatureB64;
    sigSlot.appendChild(img);
  }

  container.appendChild(clone);
}

const btnHamburger      = document.getElementById('btnHamburger');
const hamburgerDropdown = document.getElementById('hamburgerDropdown');

btnHamburger.addEventListener('click', e => {
  e.stopPropagation();
  hamburgerDropdown.classList.toggle('open');
});
document.addEventListener('click', () => hamburgerDropdown.classList.remove('open'));
hamburgerDropdown.addEventListener('click', e => e.stopPropagation());

btnPreview.addEventListener('click', () => {
  renderInvoice(readForm(), 'invoicePreview');
  previewModal.classList.add('open');
});
document.getElementById('btnClosePreview').addEventListener('click', () => previewModal.classList.remove('open'));
previewModal.addEventListener('click', e => { if (e.target === previewModal) previewModal.classList.remove('open'); });

document.getElementById('hdPrint').addEventListener('click', () => {
  hamburgerDropdown.classList.remove('open');
  renderInvoice(readForm(), 'printArea');
  setTimeout(() => window.print(), 300);
});

document.getElementById('hdDownloadPng').addEventListener('click', async () => {
  hamburgerDropdown.classList.remove('open');
  const btn = document.getElementById('hdDownloadPng');
  flash(btn, '⏳ Generando...', 8000);
  try {
    const canvas = await captureInvoice();
    const data   = readForm();
    const link   = document.createElement('a');
    link.download = `comprobante_${slugify(data.clienteNombre)}_${data.mesPublicidad || 'sin_mes'}.png`;
    link.href     = canvas.toDataURL('image/png');
    link.click();
  } catch (e) { alert('Error al generar PNG.'); console.error(e); }
});

document.getElementById('hdDownloadPdf').addEventListener('click', async () => {
  hamburgerDropdown.classList.remove('open');
  const btn = document.getElementById('hdDownloadPdf');
  flash(btn, '⏳ Generando...', 8000);
  try {
    const canvas  = await captureInvoice();
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgW = pdfW - 20;
    const imgH = imgW / (canvas.width / canvas.height);
    const yOff = Math.max((pdfH - imgH) / 2, 10);
    pdf.addImage(imgData, 'PNG', 10, yOff, imgW, imgH);
    const data = readForm();
    pdf.save(`comprobante_${slugify(data.clienteNombre)}_${data.mesPublicidad || 'sin_mes'}.pdf`);
  } catch (e) { alert('Error al generar PDF.'); console.error(e); }
});

document.getElementById('hdSwitchProfile').addEventListener('click', () => {
  hamburgerDropdown.classList.remove('open');
  openInvoiceProfileModal();
});

document.getElementById('hdToggleTheme').addEventListener('click', () => {
  hamburgerDropdown.classList.remove('open');
  applyTheme(document.body.classList.contains('light') ? 'dark' : 'light');
});

async function captureInvoice() {
  renderInvoice(readForm(), 'captureArea');
  const el = captureArea.querySelector('.invoice-wrapper');
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#fff' });
  captureArea.innerHTML = '';
  return canvas;
}

function applyTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light');
    document.getElementById('hdThemeLabel').textContent = 'Modo oscuro';
  } else {
    document.body.classList.remove('light');
    document.getElementById('hdThemeLabel').textContent = 'Modo claro';
  }
  localStorage.setItem(THEME_KEY, theme);
}